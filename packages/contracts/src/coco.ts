/**
 * @sightforge/contracts - COCO 80-Class Standard Taxonomy & Presets
 *
 * Defines the canonical 80 object classes for YOLO detection and segmentation models,
 * along with intuitive preset category groups for client-side selection.
 */

export const COCO_CLASSES = [
  "person",
  "bicycle",
  "car",
  "motorcycle",
  "airplane",
  "bus",
  "train",
  "truck",
  "boat",
  "traffic light",
  "fire hydrant",
  "stop sign",
  "parking meter",
  "bench",
  "bird",
  "cat",
  "dog",
  "horse",
  "sheep",
  "cow",
  "elephant",
  "bear",
  "zebra",
  "giraffe",
  "backpack",
  "umbrella",
  "handbag",
  "tie",
  "suitcase",
  "frisbee",
  "skis",
  "snowboard",
  "sports ball",
  "kite",
  "baseball bat",
  "baseball glove",
  "skateboard",
  "surfboard",
  "tennis racket",
  "bottle",
  "wine glass",
  "cup",
  "fork",
  "knife",
  "spoon",
  "bowl",
  "banana",
  "apple",
  "sandwich",
  "orange",
  "broccoli",
  "carrot",
  "hot dog",
  "pizza",
  "donut",
  "cake",
  "chair",
  "couch",
  "potted plant",
  "bed",
  "dining table",
  "toilet",
  "tv",
  "laptop",
  "mouse",
  "remote",
  "keyboard",
  "cell phone",
  "microwave",
  "oven",
  "toaster",
  "sink",
  "refrigerator",
  "book",
  "clock",
  "vase",
  "scissors",
  "teddy bear",
  "hair drier",
  "toothbrush",
] as const;

export type CocoClassName = (typeof COCO_CLASSES)[number];

export interface CocoClassItem {
  id: number;
  name: CocoClassName;
}

export const COCO_CLASS_ITEMS: readonly CocoClassItem[] = COCO_CLASSES.map(
  (name, id) => ({
    id,
    name,
  }),
);

export interface CocoClassPreset {
  id: string;
  label: string;
  description: string;
  classIds: number[];
}

export const COCO_PRESETS: readonly CocoClassPreset[] = [
  {
    id: "all",
    label: "All Classes",
    description: "Detect all 80 standard COCO categories",
    classIds: [], // Empty array represents all classes (unfiltered)
  },
  {
    id: "people",
    label: "People & Apparel",
    description: "Pedestrians, bags, accessories",
    classIds: [0, 24, 25, 26, 27, 28],
  },
  {
    id: "vehicles",
    label: "Vehicles & Transport",
    description: "Cars, motorcycles, buses, trucks, boats, planes",
    classIds: [1, 2, 3, 4, 5, 6, 7, 8],
  },
  {
    id: "animals",
    label: "Animals & Wildlife",
    description: "Pets, domestic animals, wild animals",
    classIds: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
  },
  {
    id: "electronics",
    label: "Electronics & Office",
    description: "Laptops, phones, TVs, keyboards, mice",
    classIds: [62, 63, 64, 65, 66, 67, 72],
  },
  {
    id: "furniture",
    label: "Furniture & Indoor",
    description: "Chairs, tables, beds, couches, appliances",
    classIds: [56, 57, 58, 59, 60, 61, 68, 69, 70, 71],
  },
  {
    id: "food",
    label: "Food & Dining",
    description: "Fruits, snacks, kitchen utensils",
    classIds: [
      39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55,
    ],
  },
  {
    id: "sports",
    label: "Sports & Recreation",
    description: "Balls, rackets, skateboards, snowboards",
    classIds: [29, 30, 31, 32, 33, 34, 35, 36, 37, 38],
  },
] as const;

/**
 * Validates whether an array of class IDs contains valid COCO indices [0..79].
 */
export function isValidCocoClassList(classIds: unknown): classIds is number[] {
  if (!Array.isArray(classIds)) return false;
  return classIds.every(
    (id) =>
      typeof id === "number" && Number.isInteger(id) && id >= 0 && id < 80,
  );
}
