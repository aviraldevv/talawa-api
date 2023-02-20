import "dotenv/config";
import { Types } from "mongoose";
import { User, Organization, Event } from "../../../src/models";
import { MutationAdminRemoveEventArgs } from "../../../src/types/generatedGraphQLTypes";
import { connect, disconnect } from "../../../src/db";
import { adminRemoveEvent as adminRemoveEventResolver } from "../../../src/resolvers/Mutation/adminRemoveEvent";
import {
  EVENT_NOT_FOUND_MESSAGE,
  ORGANIZATION_NOT_FOUND_MESSAGE,
  USER_NOT_FOUND_MESSAGE,
  USER_NOT_AUTHORIZED_MESSAGE,
} from "../../../src/constants";
import i18n from "i18n";
import express from "express";
import { appConfig } from "../../../src/config";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { testUserType, testOrganizationType } from "../../helpers/userAndOrg";
import { testEventType, createTestEvent } from "../../helpers/events";

const app = express();
i18n.configure({
  directory: `${__dirname}/locales`,
  staticCatalog: {
    en: require("../../../locales/en.json"),
    hi: require("../../../locales/hi.json"),
    zh: require("../../../locales/zh.json"),
    sp: require("../../../locales/sp.json"),
    fr: require("../../../locales/fr.json"),
  },
  queryParameter: "lang",
  defaultLocale: appConfig.defaultLocale,
  locales: appConfig.supportedLocales,
  autoReload: process.env.NODE_ENV !== "production",
  updateFiles: process.env.NODE_ENV !== "production",
  syncFiles: process.env.NODE_ENV !== "production",
});
app.use(i18n.init);

let testUser: testUserType;
let testOrganization: testOrganizationType;
let testEvent: testEventType;

beforeAll(async () => {
  await connect();
  const resultsArray = await createTestEvent();

  testUser = resultsArray[0];
  testOrganization = resultsArray[1];
  testEvent = resultsArray[2];
  const { requestContext } = await import("../../../src/libraries");
  vi.spyOn(requestContext, "translate").mockImplementation(
    (message) => message
  );
});

afterAll(async () => {
  await disconnect();
});

describe("resolvers -> Mutation -> adminRemoveEvent", () => {
  it(`throws NotFoundError if no event exists with _id === args.id`, async () => {
    const { requestContext } = await import("../../../src/libraries");
    vi.spyOn(requestContext, "translate").mockImplementation(
      (message) => message
    );
    try {
      const args: MutationAdminRemoveEventArgs = {
        eventId: Types.ObjectId().toString(),
      };

      const context = {
        userId: testUser!.id,
      };

      await adminRemoveEventResolver?.({}, args, context);
    } catch (error: any) {
      expect(error.message).toEqual(EVENT_NOT_FOUND_MESSAGE);
    }
  });

  it(`throws NotFoundError if no organization exists with _id === event.organization
  for event with _id === args.eventId`, async () => {
    try {
      await Event.updateOne(
        {
          _id: testEvent!._id,
        },
        {
          $set: {
            organization: Types.ObjectId().toString(),
          },
        }
      );

      const args: MutationAdminRemoveEventArgs = {
        eventId: testEvent!.id,
      };

      const context = {
        userId: Types.ObjectId().toString(),
      };

      await adminRemoveEventResolver?.({}, args, context);
    } catch (error: any) {
      expect(error.message).toEqual(ORGANIZATION_NOT_FOUND_MESSAGE);
    }
  });

  it(`throws NotFoundError if no user exists with _id === context.userId`, async () => {
    try {
      await Event.updateOne(
        {
          _id: testEvent!._id,
        },
        {
          $set: {
            organization: testOrganization!._id,
          },
        }
      );

      const args: MutationAdminRemoveEventArgs = {
        eventId: testEvent!.id,
      };

      const context = {
        userId: Types.ObjectId().toString(),
      };

      await adminRemoveEventResolver?.({}, args, context);
    } catch (error: any) {
      expect(error.message).toEqual(USER_NOT_FOUND_MESSAGE);
    }
  });

  it(`throws UnauthorizedError if user with _id === context.userId is not an admin
  of organization with _id === event.organization for event with _id === args.eventId`, async () => {
    const { requestContext } = await import("../../../src/libraries");
    const spy = vi
      .spyOn(requestContext, "translate")
      .mockImplementationOnce((message) => message);
    try {
      await Organization.updateOne(
        {
          _id: testOrganization!._id,
        },
        {
          $set: {
            admins: [],
          },
        }
      );

      const args: MutationAdminRemoveEventArgs = {
        eventId: testEvent!.id,
      };

      const context = {
        userId: testUser!.id,
      };
      vi.doMock("../../../src/constants", async () => {
        const actualConstants: object = await vi.importActual(
          "../../../src/constants"
        );
        return {
          ...actualConstants,
        };
      });
      await adminRemoveEventResolver?.({}, args, context);
    } catch (error: any) {
      expect(spy).toBeCalledWith(USER_NOT_AUTHORIZED_MESSAGE);
      expect(error.message).toEqual(USER_NOT_AUTHORIZED_MESSAGE);
    }
  });

  it(`removes event with _id === args.eventId and returns it`, async () => {
    await Organization.updateOne(
      {
        _id: testOrganization!._id,
      },
      {
        $push: {
          admins: testUser!._id,
        },
      }
    );

    const args: MutationAdminRemoveEventArgs = {
      eventId: testEvent!.id,
    };

    const context = {
      userId: testUser!.id,
    };

    const adminRemoveEventPayload = await adminRemoveEventResolver?.(
      {},
      args,
      context
    );

    expect(adminRemoveEventPayload).toEqual(testEvent!.toObject());

    const testUpdatedUser = await User.findOne({
      _id: testUser!._id,
    })
      .select(["createdEvents", "eventAdmin", "registeredEvents"])
      .lean();

    expect(testUpdatedUser).toEqual(
      expect.objectContaining({
        createdEvents: expect.arrayContaining([]),
        eventAdmin: expect.arrayContaining([]),
        registeredEvents: expect.arrayContaining([]),
      })
    );
  });
});
