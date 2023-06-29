import mongoose from "mongoose";
import { MONGO_DB_URL, DEFAULT_TENANT_ID } from "./constants";
import { logger } from "./libraries";

const tenantConnectionMap: { [key: string]: mongoose.Connection } = {};

export const connect = async (): Promise<void> => {
  try {
    await mongoose.connect(MONGO_DB_URL as string, {
      useCreateIndex: true,
      useUnifiedTopology: true,
      useFindAndModify: false,
      useNewUrlParser: true,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      const errorMessage = error.toString();
      if (errorMessage.includes("ECONNREFUSED")) {
        logger.error("\n\n\n\x1b[1m\x1b[31m%s\x1b[0m", error);
        logger.error(
          "\n\n\x1b[1m\x1b[34m%s\x1b[0m",
          `- Connection to MongoDB failed: There are several potential causes for this issue, including:`
        );
        logger.error(
          "\x1b[1m\x1b[33m%s\x1b[0m",
          `- Unstable Network Connection`
        );
        logger.error("\x1b[1m\x1b[33m%s\x1b[0m", `- Invalid Connection String`);
        logger.error(
          "\x1b[1m\x1b[33m%s\x1b[0m",
          `- MongoDB Server may not be running`
        );
        logger.error(
          "\x1b[1m\x1b[33m%s\x1b[0m",
          `- Firewall may not be configured to allow incoming connections on MongoDB port.`
        );
        logger.error(
          "\x1b[1m\x1b[31m%s\x1b[0m",
          `- Please try again with the fixes !`
        );
      } else {
        logger.error("Error while connecting to mongo database", error);
      }
      process.exit(1);
    }
  }
};

export const getTenantConnection = (tenantId: string): mongoose.Connection => {
  if (!tenantConnectionMap[tenantId]) {
    const tenantDbUrl = `${MONGO_DB_URL}/tenant_${tenantId}`;

    // Create a new connection for the tenant-specific database
    const tenantConnection = mongoose.createConnection(tenantDbUrl, {
      useCreateIndex: true,
      useUnifiedTopology: true,
      useFindAndModify: false,
      useNewUrlParser: true,
    });

    // Store the connection in the map
    tenantConnectionMap[tenantId] = tenantConnection;
  }
  return tenantConnectionMap[tenantId];
};

export const disconnect = async (): Promise<void> => {
  // Close all tenant-specific connections
  for (const tenantId in tenantConnectionMap) {
    await tenantConnectionMap[tenantId].close();
  }

  // Close the main connection
  await mongoose.connection.close();
};

connect();

export const getDefaultConnection = (): mongoose.Connection =>
  mongoose.connection;

// Export a function to get the connection for a specific tenant
export const getConnectionForTenant = (
  tenantId: string | undefined = DEFAULT_TENANT_ID
): mongoose.Connection => {
  // Use the default connection if the tenant ID is not provided or is the default tenant
  if (!tenantId || tenantId === DEFAULT_TENANT_ID) {
    return getDefaultConnection();
  }

  // Use the tenant-specific connection for the provided tenant ID
  return getTenantConnection(tenantId);
};
