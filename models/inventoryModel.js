import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const InventoryItem = sequelize.define("InventoryItem", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  code: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(120), allowNull: false },
  category: {
    type: DataTypes.ENUM(
      "Meat", "Poultry", "Seafood", "Vegetables", "Fruits", "Dairy & Eggs",
      "Dry Goods", "Grains & Pasta", "Bakery", "Frozen Foods", "Beverages",
      "Condiments", "Spices & Herbs", "Oils & Vinegars", "Canned & Packaged",
      "Sauces & Seasonings", "Desserts", "Kitchen Supplies", "Cleaning Supplies",
      "Packaging & Disposables", "Food Service Supplies", "Equipment & Smallwares", "Other"
    ),
    allowNull: false
  },
  description: { type: DataTypes.TEXT, allowNull: true },
  unit: { type: DataTypes.STRING(30), allowNull: false },
  quantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
  minimumStock: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
  unitCost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
});

export const InventoryBatch = sequelize.define("InventoryBatch", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  receivedQuantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  remainingQuantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  unitCost: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  supplierId: { type: DataTypes.STRING(80), allowNull: true },
  supplierName: { type: DataTypes.STRING(160), allowNull: true },
  deliveryDate: { type: DataTypes.DATEONLY, allowNull: false },
  expirationDate: { type: DataTypes.DATEONLY, allowNull: true },
  remarks: { type: DataTypes.TEXT, allowNull: true }
});

export const InventoryTransaction = sequelize.define("InventoryTransaction", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  type: {
    type: DataTypes.ENUM("stock_in", "usage", "waste", "damaged", "expired"),
    allowNull: false
  },
  quantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  balanceAfter: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  unitCost: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  supplierId: { type: DataTypes.STRING(80), allowNull: true },
  supplierName: { type: DataTypes.STRING(160), allowNull: true },
  deliveryDate: { type: DataTypes.DATEONLY, allowNull: true },
  transactionDate: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  expirationDate: { type: DataTypes.DATEONLY, allowNull: true },
  remarks: { type: DataTypes.TEXT, allowNull: true },
  performedBy: { type: DataTypes.STRING(120), allowNull: false }
});

export const InventoryTransactionAllocation = sequelize.define("InventoryTransactionAllocation", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  quantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  unitCost: { type: DataTypes.DECIMAL(12, 2), allowNull: false }
});

InventoryItem.hasMany(InventoryBatch, {
  foreignKey: { name: "inventoryItemId", allowNull: false },
  onDelete: "RESTRICT"
});
InventoryBatch.belongsTo(InventoryItem, { foreignKey: "inventoryItemId", as: "inventoryItem" });
InventoryItem.hasMany(InventoryTransaction, {
  foreignKey: { name: "inventoryItemId", allowNull: false },
  onDelete: "RESTRICT"
});
InventoryTransaction.belongsTo(InventoryItem, { foreignKey: "inventoryItemId", as: "inventoryItem" });
InventoryBatch.hasMany(InventoryTransaction, {
  foreignKey: { name: "inventoryBatchId", allowNull: true },
  onDelete: "RESTRICT"
});
InventoryTransaction.belongsTo(InventoryBatch, { foreignKey: "inventoryBatchId", as: "inventoryBatch" });
InventoryTransaction.hasMany(InventoryTransactionAllocation, {
  foreignKey: { name: "inventoryTransactionId", allowNull: false },
  as: "allocations",
  onDelete: "RESTRICT"
});
InventoryTransactionAllocation.belongsTo(InventoryTransaction, {
  foreignKey: "inventoryTransactionId",
  as: "transaction"
});
InventoryBatch.hasMany(InventoryTransactionAllocation, {
  foreignKey: { name: "inventoryBatchId", allowNull: false },
  as: "allocations",
  onDelete: "RESTRICT"
});
InventoryTransactionAllocation.belongsTo(InventoryBatch, {
  foreignKey: "inventoryBatchId",
  as: "inventoryBatch"
});
