import "dotenv/config";
import { Types } from "mongoose";
import {
  Organization,
  DirectChat,
  DirectChatMessage,
} from "../../../src/models";
import { MutationRemoveDirectChatArgs } from "../../../src/types/generatedGraphQLTypes";
import { connect, disconnect } from "../../../src/db";
import {
  USER_NOT_AUTHORIZED_MESSAGE,
  ORGANIZATION_NOT_FOUND_MESSAGE,
  CHAT_NOT_FOUND_MESSAGE,
} from "../../../src/constants";
import i18n from "i18n";
import express from "express";
import { appConfig } from "../../../src/config";
import {
  beforeAll,
  afterAll,
  describe,
  it,
  expect,
  vi,
  afterEach,
} from "vitest";
import { testOrganizationType, testUserType } from "../../helpers/userAndOrg";
import {
  createTestDirectChat,
  testDirectChatType,
} from "../../helpers/directChat";

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
let testDirectChat: testDirectChatType;

beforeAll(async () => {
  await connect();
  const temp = await createTestDirectChat();
  testUser = temp[0];
  testOrganization = temp[1];

  testDirectChat = await DirectChat.create({
    users: [testUser!._id],
    creator: testUser!._id,
    organization: testOrganization!._id,
  });

  const testDirectChatMessage = temp[2];

  testDirectChat = await DirectChat.findOneAndUpdate(
    {
      _id: testDirectChat._id,
    },
    {
      $push: {
        messages: testDirectChatMessage!._id,
      },
    },
    {
      new: true,
    }
  );
});

afterAll(async () => {
  await disconnect();
});

describe("resolvers -> Mutation -> removeDirectChat", () => {
  afterEach(() => {
    vi.doUnmock("../../../src/constants");
    vi.resetModules();
  });

  it(`throws NotFoundError if no organization exists with _id === args.organizationId and IN_PRODUCTION === true`, async () => {
    const { requestContext } = await import("../../../src/libraries");
    const spy = vi
      .spyOn(requestContext, "translate")
      .mockImplementation((message) => `Translated ${message}`);

    try {
      const args: MutationRemoveDirectChatArgs = {
        chatId: "",
        organizationId: Types.ObjectId().toString(),
      };

      const context = {
        userId: testUser!.id,
      };

      const { removeDirectChat: removeDirectChatResolver } = await import(
        "../../../src/resolvers/Mutation/removeDirectChat"
      );
      await removeDirectChatResolver?.({}, args, context);
    } catch (error: any) {
      expect(spy).toHaveBeenCalledWith(ORGANIZATION_NOT_FOUND_MESSAGE);
      expect(error.message).toEqual(
        `Translated ${ORGANIZATION_NOT_FOUND_MESSAGE}`
      );
    }
  });

  it(`throws NotFoundError if no directChat exists with _id === args.chatId and IN_PRODUCTION === true`, async () => {
    const { requestContext } = await import("../../../src/libraries");
    const spy = vi
      .spyOn(requestContext, "translate")
      .mockImplementation((message) => `Translated ${message}`);

    try {
      const args: MutationRemoveDirectChatArgs = {
        chatId: Types.ObjectId().toString(),
        organizationId: testOrganization!.id,
      };

      const context = {
        userId: testUser!.id,
      };

      const { removeDirectChat: removeDirectChatResolver } = await import(
        "../../../src/resolvers/Mutation/removeDirectChat"
      );
      await removeDirectChatResolver?.({}, args, context);
    } catch (error: any) {
      expect(spy).toHaveBeenCalledWith(CHAT_NOT_FOUND_MESSAGE);
      expect(error.message).toEqual(`Translated ${CHAT_NOT_FOUND_MESSAGE}`);
    }
  });

  it(`throws UnauthorizedError if user with _id === context.userId is not an admin
  of organization with _id === args.organizationId`, async () => {
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

      const args: MutationRemoveDirectChatArgs = {
        chatId: testDirectChat!.id,
        organizationId: testOrganization!.id,
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

      const { removeDirectChat: removeDirectChatResolver } = await import(
        "../../../src/resolvers/Mutation/removeDirectChat"
      );
      await removeDirectChatResolver?.({}, args, context);
    } catch (error: any) {
      expect(spy).toBeCalledWith(USER_NOT_AUTHORIZED_MESSAGE);
      expect(error.message).toEqual(USER_NOT_AUTHORIZED_MESSAGE);
    }
  });

  it(`deletes the directChat with _id === args.chatId`, async () => {
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

    const args: MutationRemoveDirectChatArgs = {
      chatId: testDirectChat!.id,
      organizationId: testOrganization!.id,
    };

    const context = {
      userId: testUser!.id,
    };

    const { removeDirectChat: removeDirectChatResolver } = await import(
      "../../../src/resolvers/Mutation/removeDirectChat"
    );
    const removeDirectChatPayload = await removeDirectChatResolver?.(
      {},
      args,
      context
    );

    expect(removeDirectChatPayload).toEqual(testDirectChat?.toObject());

    const testDeletedDirectChatMessages = await DirectChatMessage.find({
      directChatMessageBelongsTo: testDirectChat!._id,
    }).lean();

    expect(testDeletedDirectChatMessages).toEqual([]);
  });
});
