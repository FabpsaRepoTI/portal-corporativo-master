import { test, expect } from "@playwright/test";

test("El usuario puede iniciar sesión", async ({ page }) => {
  await page.goto("http://localhost:3000/portal-corporativo/fabpsa/login");

  await page.getByRole("textbox", { name: "Usuario" }).fill("JMRAMIREZ");

  await page.getByRole("textbox", { name: "Contraseña" }).fill("Rama*/225");

  await page.getByRole("textbox", { name: "Contraseña" }).press("Enter");

  // Esperamos a que termine el login
  await page.waitForLoadState("networkidle");

  // Verificamos que ya no estamos en login
  await expect(page).not.toHaveURL(/\/login/);
});



