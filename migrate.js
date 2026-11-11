import { Sequelize } from "sequelize";
import { DataTypes } from "sequelize";
import { sequelize } from "./models/db.js";
import { User } from "./models/userModel.js";
import { InventoryItem, InventoryTransaction } from "./models/inventoryModel.js";

const databaseName = process.env.DB_NAME || "InventoryJapz";
const rootSequelize = new Sequelize("", process.env.DB_USER || "root", process.env.DB_PASSWORD || "", {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  dialect: "mysql",
  logging: false
});

try {
  if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
    throw new Error("DB_NAME may contain only letters, numbers, and underscores.");
  }
  await rootSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\`;`);
  console.log(`Database '${databaseName}' is ready.`);
  await sequelize.authenticate();
  console.log("Connected to MySQL database.");
  await sequelize.sync();
  const transactionTable = InventoryTransaction.getTableName();
  const transactionColumns = await sequelize.getQueryInterface().describeTable(transactionTable);
  const deliveryDateField = InventoryTransaction.rawAttributes.deliveryDate.field;
  if (!transactionColumns[deliveryDateField]) {
    await sequelize.getQueryInterface().addColumn(transactionTable, deliveryDateField, {
      type: DataTypes.DATEONLY,
      allowNull: true
    });
    console.log("Added the stock delivery-date field to inventory history.");
  }
  const itemTable = InventoryItem.getTableName();
  const itemColumns = await sequelize.getQueryInterface().describeTable(itemTable);
  const categoryField = InventoryItem.rawAttributes.category.field;
  const categoryColumn = itemColumns[categoryField];
  if (!categoryColumn.type.includes("'Poultry'")) {
    await sequelize.getQueryInterface().changeColumn(itemTable, categoryField, {
      type: InventoryItem.rawAttributes.category.type,
      allowNull: false
    });
    console.log("Updated inventory categories without changing existing items.");
  }
  console.log("Missing application tables created without deleting existing data.");
} catch (error) {
  console.error("Migration failed:", error);
  process.exitCode = 1;
} finally {
  await rootSequelize.close();
  await sequelize.close();
}
