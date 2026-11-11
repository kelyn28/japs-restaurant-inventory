import { Op } from "sequelize";
import { sequelize } from "../models/db.js";
import {
  InventoryBatch,
  InventoryItem,
  InventoryTransaction,
  InventoryTransactionAllocation
} from "../models/inventoryModel.js";

const categories = [
  "Meat", "Poultry", "Seafood", "Vegetables", "Fruits", "Dairy & Eggs",
  "Dry Goods", "Grains & Pasta", "Bakery", "Frozen Foods", "Beverages",
  "Condiments", "Spices & Herbs", "Oils & Vinegars", "Canned & Packaged",
  "Sauces & Seasonings", "Desserts", "Kitchen Supplies", "Cleaning Supplies",
  "Packaging & Disposables", "Food Service Supplies", "Equipment & Smallwares", "Other"
];
const movementTypes = ["usage", "waste", "damaged", "expired"];
const numberValue = (value) => Number(value);
const dateOnly = (value) => value ? String(value) : null;
const today = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const validDate = (value) => {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === text;
};
const decimalValue = (value, places, max) => {
  const text = String(value ?? "").trim();
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) && number <= max ? number : null;
};
const asItem = (item) => ({
  ...item.toJSON(),
  quantity: numberValue(item.quantity),
  minimumStock: numberValue(item.minimumStock),
  unitCost: numberValue(item.unitCost)
});

async function withAvailableQuantity(items) {
  if (!items.length) return [];
  const batches = await InventoryBatch.findAll({
    attributes: ["inventoryItemId", "remainingQuantity"],
    where: {
      inventoryItemId: { [Op.in]: items.map((item) => item.id) },
      remainingQuantity: { [Op.gt]: 0 },
      [Op.or]: [{ expirationDate: null }, { expirationDate: { [Op.gte]: today() } }]
    },
    raw: true
  });
  const availableByItem = new Map();
  for (const batch of batches) {
    const itemId = Number(batch.inventoryItemId);
    availableByItem.set(itemId, (availableByItem.get(itemId) || 0) + numberValue(batch.remainingQuantity));
  }
  return items.map((item) => ({
    ...asItem(item),
    availableQuantity: availableByItem.get(item.id) || 0
  }));
}

function validateItem(body) {
  const code = String(body.code || "").trim();
  const name = String(body.name || "").trim();
  const unit = String(body.unit || "").trim();
  const category = String(body.category || "");
  const minimumStock = decimalValue(body.minimumStock, 3, 999999999.999);
  const unitCost = decimalValue(body.unitCost ?? 0, 2, 9999999999.99);
  if (!code || code.length > 40 || !name || name.length > 120 || !unit || unit.length > 30) {
    return "Item code, name, and unit are required and must be within their length limits.";
  }
  if (!categories.includes(category)) return "Select a valid inventory category.";
  if (minimumStock === null || unitCost === null) {
    return "Minimum stock and unit cost must be valid non-negative numbers.";
  }
  return null;
}

function validateQuantity(value) {
  const quantity = decimalValue(value, 3, 999999999.999);
  return quantity !== null && quantity > 0 ? quantity : null;
}

function itemWhere(query) {
  const where = { isActive: true };
  if (query.category && categories.includes(query.category)) where.category = query.category;
  if (query.search) {
    const search = String(query.search).trim().slice(0, 100);
    where[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { code: { [Op.like]: `%${search}%` } },
      { category: { [Op.like]: `%${search}%` } }
    ];
  }
  return where;
}

export async function dashboard(req, res, next) {
  try {
    const items = await InventoryItem.findAll({ where: { isActive: true } });
    const stocks = await withAvailableQuantity(items);
    const todayDate = today();
    const expiringDate = new Date();
    expiringDate.setDate(expiringDate.getDate() + 7);
    const expiringLimit = expiringDate.toISOString().slice(0, 10);
    const [expiringBatches, expiringCount, expiredCount, recentTransactions] = await Promise.all([
      InventoryBatch.findAll({
        where: {
          remainingQuantity: { [Op.gt]: 0 },
          expirationDate: { [Op.ne]: null, [Op.lte]: expiringLimit }
        },
        include: [{ model: InventoryItem, as: "inventoryItem", where: { isActive: true }, attributes: ["id", "name", "code", "unit"] }],
        order: [["expirationDate", "ASC"]],
        limit: 8
      }),
      InventoryBatch.count({
        where: {
          remainingQuantity: { [Op.gt]: 0 },
          expirationDate: { [Op.gte]: todayDate, [Op.lte]: expiringLimit }
        }
      }),
      InventoryBatch.count({
        where: {
          remainingQuantity: { [Op.gt]: 0 },
          expirationDate: { [Op.lt]: todayDate }
        }
      }),
      InventoryTransaction.findAll({
        include: [{ model: InventoryItem, as: "inventoryItem", attributes: ["name", "code", "unit"] }],
        order: [["transactionDate", "DESC"]],
        limit: 8
      })
    ]);
    const restockItems = stocks
      .filter((item) => item.availableQuantity === 0 || (
        item.minimumStock > 0 && item.availableQuantity <= item.minimumStock
      ))
      .sort((a, b) => {
        const aOut = a.availableQuantity === 0;
        const bOut = b.availableQuantity === 0;
        if (aOut !== bOut) return aOut ? -1 : 1;
        const aDepletion = a.minimumStock > 0 ? 1 - a.availableQuantity / a.minimumStock : 0;
        const bDepletion = b.minimumStock > 0 ? 1 - b.availableQuantity / b.minimumStock : 0;
        return bDepletion - aDepletion || a.name.localeCompare(b.name);
      })
      .slice(0, 8)
      .map((item) => ({
        name: item.name,
        unit: item.unit,
        availableQuantity: item.availableQuantity,
        minimumStock: item.minimumStock,
        status: item.availableQuantity === 0 ? "Out of stock" : "Low stock"
      }));
    res.json({
      totals: {
        items: stocks.length,
        units: stocks.reduce((sum, item) => sum + item.availableQuantity, 0),
        low: stocks.filter((item) => item.availableQuantity > 0 && item.availableQuantity <= item.minimumStock).length,
        out: stocks.filter((item) => item.availableQuantity === 0).length,
        expiring: expiringCount,
        expired: expiredCount,
        valuation: stocks.reduce((sum, item) => sum + item.quantity * item.unitCost, 0)
      },
      alerts: expiringBatches.map((batch) => ({
        id: batch.id,
        item: batch.inventoryItem.name,
        code: batch.inventoryItem.code,
        quantity: numberValue(batch.remainingQuantity),
        unit: batch.inventoryItem.unit,
        expirationDate: dateOnly(batch.expirationDate),
        expired: batch.expirationDate < todayDate
      })),
      recent: recentTransactions.map((transaction) => ({
        ...transaction.toJSON(),
        quantity: numberValue(transaction.quantity),
        balanceAfter: numberValue(transaction.balanceAfter),
        item: transaction.inventoryItem.name,
        code: transaction.inventoryItem.code,
        unit: transaction.inventoryItem.unit
      })),
      restockItems
    });
  } catch (error) {
    next(error);
  }
}

export async function listItems(req, res, next) {
  try {
    if (req.query.category && !categories.includes(req.query.category)) {
      return res.status(400).json({ error: "Select a valid inventory category." });
    }
    if (req.query.status && !["out", "low", "in_stock"].includes(req.query.status)) {
      return res.status(400).json({ error: "Select a valid stock status." });
    }
    const sortFields = { name: "name", category: "category", quantity: "quantity", code: "code" };
    const sort = sortFields[req.query.sort] || "name";
    const direction = req.query.direction === "desc" ? "DESC" : "ASC";
    const items = await InventoryItem.findAll({
      where: itemWhere(req.query),
      order: [[sort, direction]],
      limit: 500
    });
    let rows = await withAvailableQuantity(items);
    if (req.query.status === "out") rows = rows.filter((item) => item.availableQuantity === 0);
    if (req.query.status === "low") rows = rows.filter((item) => item.availableQuantity > 0 && item.availableQuantity <= item.minimumStock);
    if (req.query.status === "in_stock") rows = rows.filter((item) => item.availableQuantity > item.minimumStock);
    if (sort === "quantity") rows.sort((a, b) => direction === "DESC"
      ? b.availableQuantity - a.availableQuantity
      : a.availableQuantity - b.availableQuantity);
    res.json(rows);
  } catch (error) {
    next(error);
  }
}

export async function createItem(req, res, next) {
  try {
    const validationError = validateItem(req.body);
    if (validationError) return res.status(400).json({ error: validationError });
    const item = await InventoryItem.create({
      code: String(req.body.code).trim(),
      name: String(req.body.name).trim(),
      category: req.body.category,
      description: String(req.body.description || "").trim() || null,
      unit: String(req.body.unit).trim(),
      minimumStock: Number(req.body.minimumStock),
      unitCost: Number(req.body.unitCost || 0)
    });
    res.status(201).json(asItem(item));
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ error: "That item code is already in use." });
    }
    next(error);
  }
}

export async function updateItem(req, res, next) {
  try {
    const validationError = validateItem(req.body);
    if (validationError) return res.status(400).json({ error: validationError });
    const item = await InventoryItem.findOne({ where: { id: req.params.id, isActive: true } });
    if (!item) return res.status(404).json({ error: "Inventory item not found." });
    await item.update({
      code: String(req.body.code).trim(),
      name: String(req.body.name).trim(),
      category: req.body.category,
      description: String(req.body.description || "").trim() || null,
      unit: String(req.body.unit).trim(),
      minimumStock: Number(req.body.minimumStock),
      unitCost: Number(req.body.unitCost || 0)
    });
    res.json(asItem(item));
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ error: "That item code is already in use." });
    }
    next(error);
  }
}

export async function archiveItem(req, res, next) {
  try {
    const item = await InventoryItem.findOne({ where: { id: req.params.id, isActive: true } });
    if (!item) return res.status(404).json({ error: "Inventory item not found." });
    if (numberValue(item.quantity) > 0) {
      return res.status(409).json({ error: "An item with stock on hand cannot be archived." });
    }
    await item.update({ isActive: false });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function recordTransaction(req, res, next) {
  try {
    const quantity = validateQuantity(req.body.quantity);
    const type = String(req.body.type || "");
    if (!quantity || !["stock_in", ...movementTypes].includes(type)) {
      return res.status(400).json({ error: "Select a valid transaction type and enter a quantity greater than zero." });
    }
    const deliveryDate = dateOnly(req.body.deliveryDate || today());
    const expirationDate = dateOnly(req.body.expirationDate);
    if (!validDate(deliveryDate) || (expirationDate && !validDate(expirationDate))) {
      return res.status(400).json({ error: "Enter valid delivery and expiration dates." });
    }
    if (type === "stock_in" && expirationDate && expirationDate < deliveryDate) {
      return res.status(400).json({ error: "Expiration date cannot be before delivery date." });
    }
    const result = await sequelize.transaction(async (dbTransaction) => {
      const item = await InventoryItem.findOne({
        where: { id: req.params.id, isActive: true },
        transaction: dbTransaction,
        lock: dbTransaction.LOCK.UPDATE
      });
      if (!item) {
        const error = new Error("Inventory item not found.");
        error.status = 404;
        throw error;
      }

      let batch = null;
      const allocations = [];
      let unitCost = numberValue(item.unitCost);
      if (type === "stock_in") {
        const receivedCost = decimalValue(req.body.unitCost ?? item.unitCost, 2, 9999999999.99);
        if (receivedCost === null) {
          const error = new Error("Unit cost must be a valid non-negative number.");
          error.status = 400;
          throw error;
        }
        const supplierName = String(req.body.supplierName || "").trim().slice(0, 160) || null;
        if (!supplierName) {
          const error = new Error("Enter the actual supplier name for this stock-in.");
          error.status = 400;
          throw error;
        }
        const supplierId = String(req.body.supplierId || "").trim().slice(0, 80) || null;
        batch = await InventoryBatch.create({
          inventoryItemId: item.id,
          receivedQuantity: quantity,
          remainingQuantity: quantity,
          unitCost: receivedCost,
          supplierId,
          supplierName,
          deliveryDate,
          expirationDate,
          remarks: String(req.body.remarks || "").trim() || null
        }, { transaction: dbTransaction });
        allocations.push({ batch, quantity, unitCost: receivedCost });
        const existingQuantity = numberValue(item.quantity);
        const nextQuantity = existingQuantity + quantity;
        const nextCost = nextQuantity === 0
          ? receivedCost
          : ((existingQuantity * numberValue(item.unitCost)) + (quantity * receivedCost)) / nextQuantity;
        await item.update({ quantity: nextQuantity, unitCost: nextCost }, { transaction: dbTransaction });
        unitCost = receivedCost;
      } else {
        const currentQuantity = numberValue(item.quantity);
        if (quantity > currentQuantity) {
          const error = new Error(`Insufficient stock. Only ${currentQuantity} ${item.unit} available.`);
          error.status = 409;
          throw error;
        }
        const batches = await InventoryBatch.findAll({
          where: {
            inventoryItemId: item.id,
            remainingQuantity: { [Op.gt]: 0 },
            ...(type === "expired"
              ? { expirationDate: { [Op.lt]: today() } }
              : { [Op.or]: [{ expirationDate: null }, { expirationDate: { [Op.gte]: today() } }] })
          },
          order: [[sequelize.literal("expiration_date IS NULL"), "ASC"], ["expirationDate", "ASC"], ["id", "ASC"]],
          transaction: dbTransaction,
          lock: dbTransaction.LOCK.UPDATE
        });
        const eligibleQuantity = batches.reduce((sum, current) => sum + numberValue(current.remainingQuantity), 0);
        if (quantity > eligibleQuantity) {
          const error = new Error(type === "expired"
            ? "There is not enough expired batch stock to record this adjustment."
            : "There is not enough unexpired batch stock for this stock-out.");
          error.status = 409;
          throw error;
        }
        let remainingToAllocate = quantity;
        for (const currentBatch of batches) {
          if (remainingToAllocate <= 0) break;
          const allocated = Math.min(remainingToAllocate, numberValue(currentBatch.remainingQuantity));
          await currentBatch.update({
            remainingQuantity: numberValue(currentBatch.remainingQuantity) - allocated
          }, { transaction: dbTransaction });
          batch ||= currentBatch;
          allocations.push({ batch: currentBatch, quantity: allocated, unitCost: numberValue(currentBatch.unitCost) });
          remainingToAllocate -= allocated;
        }
        await item.update({ quantity: currentQuantity - quantity }, { transaction: dbTransaction });
      }

      const transaction = await InventoryTransaction.create({
        inventoryItemId: item.id,
        inventoryBatchId: batch?.id || null,
        type,
        quantity,
        balanceAfter: numberValue(item.quantity),
        unitCost,
        supplierId: type === "stock_in" ? batch.supplierId : null,
        supplierName: type === "stock_in" ? batch.supplierName : null,
        deliveryDate: type === "stock_in" ? deliveryDate : null,
        transactionDate: new Date(),
        expirationDate,
        remarks: String(req.body.remarks || "").trim() || null,
        performedBy: req.session.user.name
      }, { transaction: dbTransaction });
      await InventoryTransactionAllocation.bulkCreate(allocations.map((allocation) => ({
        inventoryTransactionId: transaction.id,
        inventoryBatchId: allocation.batch.id,
        quantity: allocation.quantity,
        unitCost: allocation.unitCost
      })), { transaction: dbTransaction });
      return transaction;
    });
    res.status(201).json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
}

export async function reports(req, res, next) {
  try {
    const dateFrom = req.query.from && String(req.query.from);
    const dateTo = req.query.to && String(req.query.to);
    if ((dateFrom && !validDate(dateFrom)) || (dateTo && !validDate(dateTo))) {
      return res.status(400).json({ error: "Enter a valid report date range." });
    }
    if (dateFrom && dateTo && dateFrom > dateTo) {
      return res.status(400).json({ error: "Report start date must be on or before the end date." });
    }
    const type = String(req.query.type || "stock");
    const stockTypes = ["stock", "low_stock", "out_of_stock", "valuation"];
    const expiryTypes = ["expiring", "expired"];
    if (!["all", "stock_in", ...movementTypes, ...stockTypes, ...expiryTypes].includes(type)) {
      return res.status(400).json({ error: "Select a valid report type." });
    }
    if (req.query.category && !categories.includes(req.query.category)) {
      return res.status(400).json({ error: "Select a valid inventory category." });
    }
    const conditions = [];
    if (type !== "stock" && type !== "all" && !stockTypes.includes(type) && !expiryTypes.includes(type)) conditions.push({ type });
    if (dateFrom || dateTo) {
      const transactionDate = {};
      if (dateFrom) transactionDate[Op.gte] = new Date(`${dateFrom}T00:00:00`);
      if (dateTo) transactionDate[Op.lte] = new Date(`${dateTo}T23:59:59`);
      conditions.push({ transactionDate });
    }
    const itemFilter = req.query.category ? { category: req.query.category, isActive: true } : { isActive: true };
    if (stockTypes.includes(type)) {
      if (type === "low_stock") {
        itemFilter[Op.and] = [
          { quantity: { [Op.gt]: 0 } },
          sequelize.where(sequelize.col("quantity"), Op.lte, sequelize.col("minimum_stock"))
        ];
      } else if (type === "out_of_stock") {
        itemFilter.quantity = 0;
      }
      const items = await InventoryItem.findAll({
        where: itemFilter,
        order: [["name", "ASC"]]
      });
      let rows = await withAvailableQuantity(items);
      if (type === "low_stock") rows = rows.filter((item) => item.availableQuantity > 0 && item.availableQuantity <= item.minimumStock);
      if (type === "out_of_stock") rows = rows.filter((item) => item.availableQuantity === 0);
      return res.json({
        type,
        rows: rows.map((item) => ({
          ...item,
          valuation: numberValue(item.quantity) * numberValue(item.unitCost)
        }))
      });
    }
    if (expiryTypes.includes(type)) {
      const expiryPredicates = [type === "expired"
        ? { expirationDate: { [Op.lt]: today() } }
        : { expirationDate: { [Op.gte]: today() } }];
      if (type === "expiring") {
        const expiryLimit = new Date(`${today()}T00:00:00.000Z`);
        expiryLimit.setUTCDate(expiryLimit.getUTCDate() + 7);
        expiryPredicates.push({ expirationDate: { [Op.lte]: expiryLimit.toISOString().slice(0, 10) } });
      }
      if (dateFrom) expiryPredicates.push({ expirationDate: { [Op.gte]: dateFrom } });
      if (dateTo) expiryPredicates.push({ expirationDate: { [Op.lte]: dateTo } });
      const batches = await InventoryBatch.findAll({
        where: {
          remainingQuantity: { [Op.gt]: 0 },
          expirationDate: { [Op.ne]: null },
          [Op.and]: expiryPredicates
        },
        include: [{ model: InventoryItem, as: "inventoryItem", where: itemFilter, attributes: ["name", "code", "category", "unit"] }],
        order: [["expirationDate", "ASC"]],
        limit: 2000
      });
      return res.json({
        type,
        rows: batches.map((batch) => ({
          id: batch.id,
          item: batch.inventoryItem.name,
          code: batch.inventoryItem.code,
          category: batch.inventoryItem.category,
          unit: batch.inventoryItem.unit,
          quantity: numberValue(batch.remainingQuantity),
          expirationDate: dateOnly(batch.expirationDate),
          supplierName: batch.supplierName
        }))
      });
    }
    const transactions = await InventoryTransaction.findAll({
      where: conditions.length ? { [Op.and]: conditions } : {},
      include: [{ model: InventoryItem, as: "inventoryItem", where: itemFilter, attributes: ["name", "code", "category", "unit"] }],
      order: [["transactionDate", "DESC"]],
      limit: 2000
    });
    res.json({
      type,
      rows: transactions.map((entry) => ({
        ...entry.toJSON(),
        item: entry.inventoryItem.name,
        code: entry.inventoryItem.code,
        category: entry.inventoryItem.category,
        unit: entry.inventoryItem.unit,
        quantity: numberValue(entry.quantity),
        balanceAfter: numberValue(entry.balanceAfter),
        unitCost: numberValue(entry.unitCost)
      }))
    });
  } catch (error) {
    next(error);
  }
}
