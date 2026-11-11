
  /*
    MIT License
    
    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
    */
    
import express from "express";
import { homePage } from "../controllers/homeController.js";
import { login, loginPage, logout, register, registerPage } from "../controllers/authController.js";
import {
  archiveItem,
  createItem,
  dashboard,
  listItems,
  recordTransaction,
  reports,
  updateItem
} from "../controllers/inventoryController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { verifyCsrfToken } from "../middleware/csrf.js";
const router = express.Router();

router.get("/login", loginPage);
router.post("/login", verifyCsrfToken, login);
router.get("/register", registerPage);
router.post("/register", verifyCsrfToken, register);
router.post("/logout", requireAuth, verifyCsrfToken, logout);
router.get("/", requireAuth, homePage);

router.get("/api/dashboard", requireAuth, dashboard);
router.get("/api/items", requireAuth, listItems);
router.post("/api/items", requireAuth, verifyCsrfToken, requireRole("admin"), createItem);
router.patch("/api/items/:id", requireAuth, verifyCsrfToken, requireRole("admin"), updateItem);
router.delete("/api/items/:id", requireAuth, verifyCsrfToken, requireRole("admin"), archiveItem);
router.post("/api/items/:id/transactions", requireAuth, verifyCsrfToken, requireRole("admin", "staff"), recordTransaction);
router.get("/api/reports", requireAuth, reports);

export default router;
