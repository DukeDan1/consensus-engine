import { MongoClient } from "mongodb";

export function getConnectedMongoClient(): Promise<MongoClient> {
  let uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not defined");
  }
  let options = {};
  let client: MongoClient = new MongoClient(uri!, options);
  return client.connect();
}
