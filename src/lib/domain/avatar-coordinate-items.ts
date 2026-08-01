import placementManifest from "./avatar-coordinate-manifest.json";

export const MASTER_CANVAS = { width: 1024, height: 1536 } as const;

export type AvatarSlot =
  | "head"
  | "eyes"
  | "top"
  | "bottom"
  | "wrist"
  | "shoes";

export interface AvatarLayerPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
}

export interface AvatarLayer extends AvatarLayerPlacement {
  id: string;
  src: string;
}

export interface AvatarItem {
  id: string;
  name: string;
  slot: AvatarSlot;
  price: number;
  comingSoon: boolean;
  thumbnailSrc: string;
  layers: AvatarLayer[];
}

export interface AvatarLandmarkPoint {
  x: number;
  y: number;
}

export interface AvatarLandmarkRegion extends AvatarLandmarkPoint {
  width: number;
  height: number;
}

export interface AvatarLandmarks {
  points: Record<string, AvatarLandmarkPoint>;
  regions: Record<string, AvatarLandmarkRegion>;
}

export interface AvatarMockState {
  balance: number;
  ownedItemIds: string[];
  equippedBySlot: Partial<Record<AvatarSlot, string>>;
}

interface AvatarAssetLayer extends AvatarLayer {
  assetWidth: number;
  assetHeight: number;
}

interface AvatarItemPlacement {
  slot: AvatarSlot;
  layers: AvatarAssetLayer[];
}

type AvatarManifest = Record<string, AvatarItemPlacement>;

const AVATAR_SLOTS: AvatarSlot[] = [
  "head",
  "eyes",
  "top",
  "bottom",
  "wrist",
  "shoes",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function manifestError(itemId: string, message: string): Error {
  return new Error(`avatar manifest item '${itemId}' ${message}`);
}

function readNonEmptyString(value: unknown, itemId: string, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw manifestError(itemId, `${field} must be a non-empty string`);
  }
  return value;
}

function readFiniteNumber(value: unknown, itemId: string, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw manifestError(itemId, `${field} must be a finite number`);
  }
  return value;
}

function readPositiveNumber(value: unknown, itemId: string, field: string): number {
  const number = readFiniteNumber(value, itemId, field);
  if (number <= 0) throw manifestError(itemId, `${field} must be positive`);
  return number;
}

function readAvatarSlot(value: unknown, itemId: string): AvatarSlot {
  if (typeof value !== "string" || !AVATAR_SLOTS.includes(value as AvatarSlot)) {
    throw manifestError(itemId, "slot must be valid");
  }
  return value as AvatarSlot;
}

export function parseAvatarManifest(raw: unknown): AvatarManifest {
  if (!isRecord(raw)) throw new Error("avatar manifest must be an object");

  const manifest: AvatarManifest = {};
  for (const [itemId, rawItem] of Object.entries(raw)) {
    if (itemId.trim().length === 0) throw new Error("avatar manifest item id must be non-empty");
    if (!isRecord(rawItem)) throw manifestError(itemId, "must be an object");

    const slot = readAvatarSlot(rawItem.slot, itemId);
    if (!Array.isArray(rawItem.layers) || rawItem.layers.length === 0) {
      throw manifestError(itemId, "layers must be a non-empty array");
    }

    const layerIds = new Set<string>();
    const layers = rawItem.layers.map((rawLayer, index) => {
      const prefix = `layers[${index}]`;
      if (!isRecord(rawLayer)) throw manifestError(itemId, `${prefix} must be an object`);

      const id = readNonEmptyString(rawLayer.id, itemId, `${prefix}.id`);
      if (layerIds.has(id)) throw manifestError(itemId, `has duplicate layer id '${id}'`);
      layerIds.add(id);

      const placement: AvatarLayerPlacement = {
        x: readFiniteNumber(rawLayer.x, itemId, `${prefix}.x`),
        y: readFiniteNumber(rawLayer.y, itemId, `${prefix}.y`),
        width: readFiniteNumber(rawLayer.width, itemId, `${prefix}.width`),
        height: readFiniteNumber(rawLayer.height, itemId, `${prefix}.height`),
        z: readFiniteNumber(rawLayer.z, itemId, `${prefix}.z`),
      };
      const placementError = validateAvatarLayer(placement);
      if (placementError) throw manifestError(itemId, `${prefix} ${placementError}`);

      return {
        id,
        src: readNonEmptyString(rawLayer.src, itemId, `${prefix}.src`),
        assetWidth: readPositiveNumber(rawLayer.assetWidth, itemId, `${prefix}.assetWidth`),
        assetHeight: readPositiveNumber(rawLayer.assetHeight, itemId, `${prefix}.assetHeight`),
        ...placement,
      };
    });

    manifest[itemId] = { slot, layers };
  }
  return manifest;
}

type AvatarItemId = keyof typeof placementManifest;
const placements = parseAvatarManifest(placementManifest);

const item = (
  id: AvatarItemId,
  name: string,
  price: number,
  comingSoon: boolean,
): AvatarItem => {
  const { slot, layers } = placements[id];
  return {
    id,
    name,
    slot,
    price,
    comingSoon,
    thumbnailSrc: `/avatar-coordinate-v2/thumbnails/${id}.webp`,
    layers: layers.map(({ id, src, x, y, width, height, z }) => ({
      id,
      src,
      x,
      y,
      width,
      height,
      z,
    })),
  };
};

export const AVATAR_ITEM_CATALOG: AvatarItem[] = [
  item("gnd-cap-v2", "GND 캡", 500, false),
  item("gnd-sunglasses-v2", "블랙 선글라스", 800, true),
  item("gnd-hoodie-v2", "GND 후드", 900, true),
  item("gnd-joggers-v2", "블랙 조거팬츠", 800, true),
  item("gnd-sneakers-v2", "GND 하이탑", 1200, true),
  item("gnd-watch-v2", "블랙 스포츠 워치", 1500, true),
];

export function isAvatarMockEnabled(
  nodeEnv = process.env.NODE_ENV,
  explicitFlag = process.env.NEXT_PUBLIC_ENABLE_AVATAR_MOCK,
): boolean {
  return nodeEnv !== "production" || explicitFlag === "true";
}

export function createAvatarMockState(): AvatarMockState {
  return { balance: 12_840, ownedItemIds: [], equippedBySlot: {} };
}

export function purchaseAvatarItem(
  state: AvatarMockState,
  itemId: string,
): AvatarMockState {
  const selected = AVATAR_ITEM_CATALOG.find((candidate) => candidate.id === itemId);
  if (
    !selected ||
    selected.comingSoon ||
    state.ownedItemIds.includes(itemId) ||
    state.balance < selected.price
  ) {
    return state;
  }
  return {
    ...state,
    balance: state.balance - selected.price,
    ownedItemIds: [...state.ownedItemIds, itemId],
  };
}

export function equipAvatarItem(
  state: AvatarMockState,
  itemId: string,
): AvatarMockState {
  const selected = AVATAR_ITEM_CATALOG.find((candidate) => candidate.id === itemId);
  if (!selected || !state.ownedItemIds.includes(itemId)) return state;
  return {
    ...state,
    equippedBySlot: { ...state.equippedBySlot, [selected.slot]: itemId },
  };
}

export function unequipAvatarItem(
  state: AvatarMockState,
  itemId: string,
): AvatarMockState {
  const selected = AVATAR_ITEM_CATALOG.find((candidate) => candidate.id === itemId);
  if (!selected || state.equippedBySlot[selected.slot] !== itemId) return state;
  const equippedBySlot = { ...state.equippedBySlot };
  delete equippedBySlot[selected.slot];
  return { ...state, equippedBySlot };
}

export function layerStyle(layer: AvatarLayerPlacement) {
  return {
    position: "absolute" as const,
    left: `${(layer.x / MASTER_CANVAS.width) * 100}%`,
    top: `${(layer.y / MASTER_CANVAS.height) * 100}%`,
    width: `${(layer.width / MASTER_CANVAS.width) * 100}%`,
    height: `${(layer.height / MASTER_CANVAS.height) * 100}%`,
    zIndex: layer.z,
  };
}

export function validateAvatarLayer(layer: AvatarLayerPlacement): string | null {
  const values = [layer.x, layer.y, layer.width, layer.height, layer.z];
  if (!values.every(Number.isFinite)) return "layer values must be finite";
  if (layer.x < 0 || layer.y < 0 || layer.width <= 0 || layer.height <= 0) {
    return "layer dimensions must be positive";
  }
  if (
    layer.x + layer.width > MASTER_CANVAS.width ||
    layer.y + layer.height > MASTER_CANVAS.height
  ) {
    return "layer exceeds master canvas";
  }
  return null;
}
