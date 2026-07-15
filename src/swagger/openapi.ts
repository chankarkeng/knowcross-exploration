import { config } from "../config";

const permissiveObject = {
  type: "object",
  additionalProperties: true,
} as const;

export const openapiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Unifocus Integration Wrapper",
    version: "0.1.0",
    description:
      "Thin proxy in front of the Unifocus Integration API. The wrapper signs every upstream request with HMAC-SHA256 and logs request/response pairs so internal callers can use plain JSON without dealing with the X-Knowcross-Access header scheme.",
  },
  servers: [{ url: `http://localhost:${config.PORT}` }],
  tags: [
    { name: "Master", description: "Property master data" },
    { name: "Complain", description: "Service requests / complains" },
    { name: "Guest", description: "Guest lookup and baggage tags" },
    { name: "Automation", description: "Room events (DND / MUR)" },
    { name: "Glitch", description: "Glitch search" },
  ],
  paths: {
    "/api/master": {
      get: {
        tags: ["Master"],
        summary: "Get all property master data",
        parameters: [
          {
            name: "PropertyId",
            in: "query",
            required: false,
            schema: { type: "string" },
            description:
              "Overrides the PROPERTY_ID configured in .env. Omit to use the configured default.",
          },
        ],
        responses: {
          "200": { description: "Master data", content: { "application/json": { schema: permissiveObject } } },
        },
      },
    },
    "/api/complain/register": {
      post: {
        tags: ["Complain"],
        summary: "Register one or many service requests",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                oneOf: [
                  { $ref: "#/components/schemas/Complain" },
                  { type: "array", items: { $ref: "#/components/schemas/Complain" } },
                ],
              },
              examples: {
                single: {
                  value: {
                    PropertyId: Number(config.PROPERTY_ID),
                    LocationId: 0,
                    CategoryId: 0,
                    CallDescriptionsId: 0,
                    Priority: 1,
                    IsGuestCall: false,
                    Remarks: "Test from wrapper",
                    Operation: 1,
                    CurrentStatus: "OPN",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Search-style response", content: { "application/json": { schema: permissiveObject } } },
        },
      },
    },
    "/api/complain/search": {
      post: {
        tags: ["Complain"],
        summary: "Search service requests",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ComplainSearch" },
              examples: {
                openJobs: {
                  value: {
                    Properties: [Number(config.PROPERTY_ID)],
                    StatusCode: "OPN",
                    PageNumber: 0,
                    PageSize: 5,
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Search response", content: { "application/json": { schema: permissiveObject } } },
        },
      },
    },
    "/api/complain/update": {
      post: {
        tags: ["Complain"],
        summary: "Update / close / park a service request",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ComplainUpdate" },
              examples: {
                close: {
                  value: {
                    ComplainId: 0,
                    PropertyId: Number(config.PROPERTY_ID),
                    Operation: 2,
                    ClosedReasonCode: 0,
                    CurrentStatus: "CLS",
                    LastActionRemarks: "Closed by wrapper test",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Search-style response", content: { "application/json": { schema: permissiveObject } } },
        },
      },
    },
    "/api/complain/attachment": {
      get: {
        tags: ["Complain"],
        summary: "Get a service-request attachment as JSON (base64)",
        parameters: [
          { name: "CallRegAttachmentId", in: "query", required: true, schema: { type: "integer" } },
        ],
        responses: {
          "200": { description: "Attachment metadata + Base64String", content: { "application/json": { schema: permissiveObject } } },
        },
      },
    },
    "/api/complain/attachment/stream": {
      get: {
        tags: ["Complain"],
        summary: "Get a service-request attachment as a binary stream",
        parameters: [
          { name: "CallRegAttachmentId", in: "query", required: true, schema: { type: "integer" } },
        ],
        responses: {
          "200": { description: "Raw attachment bytes", content: { "application/octet-stream": {} } },
        },
      },
    },
    "/api/guest/lookup": {
      post: {
        tags: ["Guest"],
        summary: "Look up a guest reservation",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/GuestLookup" },
              examples: {
                inHouse: {
                  value: {
                    PropertyId: Number(config.PROPERTY_ID),
                    ReservationStatus: 2,
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Guest lookup response", content: { "application/json": { schema: permissiveObject } } },
        },
      },
    },
    "/api/guest/baggage-tag": {
      post: {
        tags: ["Guest"],
        summary: "Update baggage tag for a reservation",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BaggageTag" },
            },
          },
        },
        responses: {
          "200": { description: "Result", content: { "application/json": { schema: permissiveObject } } },
        },
      },
    },
    "/api/automation/event": {
      post: {
        tags: ["Automation"],
        summary: "Publish one or many room events (DND / MUR)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AutomationEvents" },
              examples: {
                dndOn: {
                  value: {
                    Events: [
                      {
                        PropertyId: Number(config.PROPERTY_ID),
                        EventType: "DND",
                        EventState: true,
                        LocationId: "0",
                        EventTimeStamp: new Date().toISOString(),
                      },
                    ],
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Publish result", content: { "application/json": { schema: permissiveObject } } },
        },
      },
    },
    "/api/glitch/search": {
      post: {
        tags: ["Glitch"],
        summary: "Search glitch records",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: permissiveObject,
              examples: {
                basic: {
                  value: {
                    PropertyId: Number(config.PROPERTY_ID),
                    PageNumber: 0,
                    PageSize: 5,
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Glitch search response", content: { "application/json": { schema: permissiveObject } } },
        },
      },
    },
  },
  components: {
    schemas: {
      Complain: {
        type: "object",
        additionalProperties: true,
        properties: {
          PropertyId: { type: "integer" },
          LocationId: { type: "integer" },
          CategoryId: { type: "integer" },
          CallDescriptionsId: { type: "integer" },
          Priority: { type: "integer", enum: [1, 2, 3, 4], description: "1-Normal 2-Urgent 3-Extra Urgent 4-Crisis" },
          IsGuestCall: { type: "boolean" },
          Remarks: { type: "string", maxLength: 1000 },
          Attachments: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
              properties: {
                FileName: { type: "string" },
                Base64String: { type: "string" },
                ApplicationId: { type: "integer" },
              },
            },
          },
          Operation: { type: "integer", enum: [1, 2, 3], description: "1-Register 2-Register+Close 3-Register+Park" },
          CurrentStatus: { type: "string", enum: ["OPN", "CLS", "PRK"] },
          ApplicationId: { type: "integer" },
          ClosedReasonCode: { type: "integer" },
          ReopenTime: { type: "string", format: "date-time" },
        },
      },
      ComplainSearch: {
        type: "object",
        additionalProperties: true,
        properties: {
          ComplainId: { type: "integer" },
          Properties: { type: "array", items: { type: "integer" } },
          StatusCode: { type: "string", enum: ["OPN", "PRK", "USN", "SNL", "CLS"] },
          Locations: { type: "array", items: { type: "integer" } },
          LoggedBy: { type: "array", items: { type: "integer" } },
          ApplicationId: { type: "string" },
          IsGuestCall: { type: "boolean" },
          Priority: { type: "integer", enum: [1, 2, 3, 4] },
          PageNumber: { type: "integer" },
          PageSize: { type: "integer", maximum: 25 },
          OrderBy: { type: "string" },
        },
      },
      ComplainUpdate: {
        type: "object",
        additionalProperties: true,
        required: ["ComplainId", "PropertyId", "Operation", "CurrentStatus"],
        properties: {
          ComplainId: { type: "integer" },
          PropertyId: { type: "integer" },
          Operation: { type: "integer", enum: [2, 3, 7], description: "2-Close 3-Park 7-Update remarks" },
          ClosedReasonCode: { type: "integer" },
          CurrentStatus: { type: "string", enum: ["OPN", "CLS", "PRK"] },
          Remarks: { type: "string", maxLength: 1000 },
          LastActionRemarks: { type: "string", maxLength: 1000 },
          ApplicationId: { type: "integer" },
        },
      },
      GuestLookup: {
        type: "object",
        additionalProperties: true,
        required: ["PropertyId", "ReservationStatus"],
        properties: {
          PropertyId: { type: "integer" },
          ReservationStatus: { type: "integer", enum: [1, 2, 3], description: "1-Arrival 2-In-house 3-Checked out" },
          FirstName: { type: "string", minLength: 3 },
          LastName: { type: "string", minLength: 3 },
          LocationDescription: { type: "string", minLength: 3 },
          PMSReservationId: { type: "string" },
        },
      },
      BaggageTag: {
        type: "object",
        additionalProperties: true,
        required: ["PropertyId", "BaggageTagValue"],
        properties: {
          PropertyId: { type: "integer" },
          PMSReservationId: { type: "string" },
          GuestId: { type: "integer" },
          BaggageTagValue: { type: "string" },
        },
      },
      AutomationEvents: {
        type: "object",
        additionalProperties: true,
        required: ["Events"],
        properties: {
          Events: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
              required: ["PropertyId", "EventType", "EventState", "EventTimeStamp"],
              properties: {
                PropertyId: { type: "integer" },
                IntegrationId: { type: "integer" },
                EventType: { type: "string", enum: ["DND", "MUR"] },
                EventState: { type: "boolean" },
                LocationId: { type: "string" },
                Location: { type: "string" },
                EventTimeStamp: { type: "string", format: "date-time" },
              },
            },
          },
        },
      },
    },
  },
} as const;
