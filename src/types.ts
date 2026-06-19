export interface ShoppingItem {
  id: string;
  name: string;
  quantity: string;
  checked: boolean;
  createdAt: number;
}

export interface ShoppingList {
  id: string;
  name: string;
  items: ShoppingItem[];
  updatedAt: number;
}
