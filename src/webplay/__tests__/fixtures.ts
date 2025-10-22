/**
 * Test fixtures and mock data for unit tests
 */

import type {
  PlayElementResponse,
  PlayElement,
  PlayElementDesign,
  Attachment,
} from '../playweb-client';

export const mockPlayElement: PlayElement = {
  id: 'test-element-id-123',
  name: 'Test Play Element',
  description: { value: 'Test description' },
  thumbnailUrl: { value: 'https://example.com/thumbnail.jpg' },
  playElementSettings: {},
  publishStateType: 1,
};

export const mockScriptAttachment: Attachment = {
  attachmentType: 'ATTACHMENT_TYPE_SPATIAL',
  attachmentData: {
    original: Buffer.from('console.log("test script");', 'utf-8'),
  },
  errors: [],
};

export const mockPlayElementDesign: PlayElementDesign = {
  attachments: [mockScriptAttachment],
  designMetadata: {},
  mapRotation: {},
  mutators: [],
  assetCategories: [],
  modRules: {
    compatibleRules: {
      original: new Uint8Array([1, 2, 3, 4]),
    },
  },
  modLevelDataId: { value: 'test-level-data-id' },
};

export const mockPlayElementResponse: PlayElementResponse = {
  playElement: mockPlayElement,
  playElementDesign: mockPlayElementDesign,
};

export const mockGetPlayElementRequest = {
  id: 'test-element-id-123',
  includeDenied: false,
};

export const mockUpdateScriptOptions = {
  id: 'test-element-id-123',
  script: '// Updated script\nconsole.log("Updated!");',
  includeDenied: false,
};

export const mockClientConfig = {
  host: 'test-host.example.com',
  tenancy: 'test-tenancy',
  sessionId: 'test-session-id-123',
};

/**
 * Creates a deep clone of an object to prevent test pollution
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Creates a mock gRPC response buffer
 */
export function createMockGrpcBuffer(data: Record<string, unknown>): Uint8Array {
  // This is a simplified mock - in real tests we'd use actual protobuf encoding
  const jsonString = JSON.stringify(data);
  return new Uint8Array(Buffer.from(jsonString, 'utf-8'));
}
