import mongoose from "mongoose";
export async function connectDatabase(uri: string, production = false) {
  mongoose.set("bufferCommands", false);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    autoIndex: !production,
    maxPoolSize: 20,
  });
  const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== "isdbgrid") {
    await mongoose.disconnect();
    throw new Error("MongoDB replica set required for catalogue transactions");
  }
}
export const disconnectDatabase = () => mongoose.disconnect();
