import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ruta del archivo JSON de productos (fuente de verdad)
const PRODUCTS_JSON_PATH = join(__dirname, "../data/products.json");

/**
 * Leer productos desde el archivo JSON fuente
 */
export function loadProductsFromSource() {
  try {
    if (!existsSync(PRODUCTS_JSON_PATH)) {
      console.log("⚠️  products.json no existe, se creará cuando se inicialice");
      return [];
    }

    const fileContent = readFileSync(PRODUCTS_JSON_PATH, "utf-8");
    const products = JSON.parse(fileContent);
    
    if (!Array.isArray(products)) {
      console.error("⚠️  products.json no es un array válido");
      return [];
    }

    console.log(`📦 Cargados ${products.length} productos desde products.json`);
    return products;
  } catch (error) {
    console.error("❌ Error leyendo products.json:", error);
    return [];
  }
}

/**
 * Guardar productos en el archivo JSON fuente
 */
export function saveProductsToSource(products) {
  try {
    // Asegurar que el directorio existe
    const dataDir = join(__dirname, "../data");
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

      // Convertir productos a formato JSON (sin IDs que son de la BD)
      const productsToSave = products.map((product) => ({
        name: product.name,
        category: product.category,
        price: typeof product.price === 'number' ? product.price : parseFloat(product.price),
        variant: product.variant || null,
        display_order: product.display_order || 0,
        is_active: product.is_active === 1 || product.is_active === true,
      }));

    // Ordenar por categoría y display_order para mantener consistencia
    productsToSave.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return (a.display_order || 0) - (b.display_order || 0);
    });

    // Guardar con formato legible (2 espacios de indentación)
    writeFileSync(PRODUCTS_JSON_PATH, JSON.stringify(productsToSave, null, 2), "utf-8");
    
    console.log(`✅ Guardados ${productsToSave.length} productos en products.json`);
    return true;
  } catch (error) {
    console.error("❌ Error guardando products.json:", error);
    return false;
  }
}

/**
 * Agregar un producto nuevo al archivo JSON
 */
export function addProductToSource(product) {
  try {
    const existingProducts = loadProductsFromSource();
    
    // Agregar el nuevo producto
    const newProduct = {
      name: product.name,
      category: product.category,
      price: product.price,
      variant: product.variant || null,
      display_order: product.display_order || 0,
      is_active: product.is_active === 1 || product.is_active === true,
    };
    
    existingProducts.push(newProduct);
    saveProductsToSource(existingProducts);
    return true;
  } catch (error) {
    console.error("❌ Error agregando producto a products.json:", error);
    return false;
  }
}

/**
 * Actualizar un producto en el archivo JSON
 */
export function updateProductInSource(productId, updatedProduct, allProducts) {
  try {
    // Guardar todos los productos actualizados (ya vienen con el cambio aplicado desde la BD)
    saveProductsToSource(allProducts);
    return true;
  } catch (error) {
    console.error("❌ Error actualizando producto en products.json:", error);
    return false;
  }
}

/**
 * Obtener la ruta del archivo JSON (para referencia)
 */
export function getProductsJsonPath() {
  return PRODUCTS_JSON_PATH;
}
