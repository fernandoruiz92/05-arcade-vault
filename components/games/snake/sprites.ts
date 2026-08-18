/**
 * SPRITE_ATLAS — mapa reutilizable de sprites para el juego de Snake.
 * Obtuve la imagen de: https://www.spriters-resource.com/browser_games/googlesnakegame/
 *
 * Coordenadas detectadas por análisis de píxeles de los PNG.
 * Estructura: { x, y, w, h } — recorte dentro del archivo fuente.
 *
 * Uso:
 *   import { SPRITE_ATLAS } from './sprites';
 *   ctx.drawImage(img, SPRITE_ATLAS.fruits.apple.x, SPRITE_ATLAS.fruits.apple.y,
 *                      SPRITE_ATLAS.fruits.apple.w, SPRITE_ATLAS.fruits.apple.h,
 *                      dx, dy, dw, dh);
 */
export const SPRITE_ATLAS = {
  sources: {
    fruits: '/games/snake/fruits.png', // bg transparente
  },

  // ── Frutas (fila mediana de fruits.png) ─────────────────────────────────
  // Hoja: 3790x442 px. Fondo transparente.  Fila usada: y=136–295 (160px de alto).
  fruits: {
    banana: { x: 34, y: 136, w: 110, h: 160 },
    orange: { x: 186, y: 136, w: 150, h: 160 },
    grape: { x: 378, y: 136, w: 110, h: 160 },
    garlic: { x: 540, y: 136, w: 130, h: 160 },
    eggplant: { x: 712, y: 136, w: 130, h: 160 },
    strawberry: { x: 894, y: 136, w: 110, h: 160 },
    cherry: { x: 1066, y: 136, w: 110, h: 160 },
    carrot: { x: 1228, y: 136, w: 130, h: 160 },
    mushroom: { x: 1400, y: 136, w: 130, h: 160 },
    broccoli: { x: 1582, y: 136, w: 110, h: 160 },
    watermelon: { x: 1734, y: 136, w: 150, h: 160 },
    pepper: { x: 1906, y: 136, w: 150, h: 160 },
    kiwi: { x: 2068, y: 136, w: 170, h: 160 },
    lemon: { x: 2250, y: 136, w: 140, h: 160 },
    peach: { x: 2432, y: 136, w: 130, h: 160 },
    peanut: { x: 2604, y: 136, w: 130, h: 160 },
    apple: { x: 2786, y: 136, w: 110, h: 160 },
    tomato: { x: 2948, y: 136, w: 130, h: 160 },
    berries: { x: 3110, y: 136, w: 150, h: 160 },
    grapes2: { x: 3302, y: 136, w: 110, h: 160 },
    pineapple: { x: 3454, y: 136, w: 150, h: 160 },
    melon: { x: 3637, y: 136, w: 130, h: 160 },
  },
} as const;
