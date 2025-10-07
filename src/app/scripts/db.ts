// scripts/createItem.ts
import { dbConnect } from "@/app/lib/mongoose";
import { Item, IItem } from "@/app/models/item";

async function createItem(): Promise<void> {
  await dbConnect();

  // Create a new item
  const newItem: IItem = new Item({
    name: "Test Item",
    description: "This is a test",
  });

  // Save to MongoDB (creates collection if it doesn't exist)
  await newItem.save();

  console.log("Item inserted");
}

// Execute the function
createItem().catch((error) => {
  console.error("Error creating item:", error);
});
