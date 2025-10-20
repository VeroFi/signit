import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { generateId } from '../Utils.js';
dotenv.config();

export default async function createContactIndex() {
  // Provide the complete MongoDB connection URL with the database name
  // Check DATABASE_URI first (preferred), then MONGODB_URI, then fallback to localhost
  const uri = process.env.DATABASE_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/dev';
  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
  });
  try {
    await client.connect();
    const database = client.db();

    const migrationCollection = database.collection('Migrationdb');
    const migrationName = 'contactIndex_1';

    // Check if the migration has already been executed
    const migrationExists = await migrationCollection.findOne({ name: migrationName });

    if (migrationExists) {
      console.log(' INFO  No migrations were executed, database schema was already up to date.');
      console.log(' SUCCESS  Successfully ran indexed migrations directly on db.');
      return;
    }

    const collection = database.collection('contracts_Contactbook');

    // Create the unique index, but only on documents where IsImported is true
    const query = {
      IsImported: { $eq: true },
      $or: [{ IsDeleted: false }, { IsDeleted: { $eq: false } }],
    }; // Include documents with IsImported: true and IsDeleted not true
    await collection.createIndex(
      { _p_CreatedBy: 1, Email: 1, IsImported: 1 },
      { unique: true, partialFilterExpression: query }
    );

    // Save the migration record in the migrationdb collection
    await migrationCollection.insertOne({
      _id: generateId(10),
      name: migrationName,
      _created_at: new Date(),
      _updated_at: new Date(),
      executedAt: new Date(),
      details: 'Created unique index on CreatedBy, IsImported, Email',
    });

    const migrationdb = database.collection('_SCHEMA');
    // create migrationdb SCHEMA migrationdb

    // Document to be upserted
    const schemaDocument = {
      _id: 'Migrationdb',
      objectId: 'string',
      name: 'string',
      updatedAt: 'date',
      createdAt: 'date',
      executedAt: 'date',
      details: 'string',
    };

    // Upsert the document (insert if not exists, update if exists)
    await migrationdb.updateOne(
      { _id: 'Migrationdb' },
      { $set: schemaDocument },
      { upsert: true }
    );
    console.log(' Unique index created successfully.');
    console.log(' SUCCESS  Successfully ran indexed migrations directly on db.');
  } catch (error) {
    console.log(' ERROR  running indexed migration:', error);
  } finally {
    await client.close();
  }
}
