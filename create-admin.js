import bcrypt from "bcrypt";
import { sequelize } from "./models/db.js";
import { User } from "./models/userModel.js";

const name = String(process.env.ADMIN_NAME || "").trim();
const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = String(process.env.ADMIN_PASSWORD || "");

if (!name || !email || password.length < 12) {
  console.error("Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD (at least 12 characters).");
  process.exitCode = 1;
} else {
  try {
    await sequelize.authenticate();
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      throw new Error("An account already exists for that email; no account was changed.");
    }
    await User.create({
      name,
      email,
      password: await bcrypt.hash(password, 12),
      role: "admin"
    });
    console.log(`Administrator account created for ${email}.`);
  } catch (error) {
    console.error("Could not create administrator:", error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}
