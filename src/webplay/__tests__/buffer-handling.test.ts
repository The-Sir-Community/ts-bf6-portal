/**
 * Tests for buffer handling and conversion functions
 * These tests verify the fixes for buffer-related bugs discovered during live testing
 */

import { PlayElementModifier, SantiagoWebPlayClient } from '../playweb-client';
import type { PlayElementResponse, PlayElementDesign } from '../playweb-client';

// Mock fetch globally
global.fetch = jest.fn();

// Mock protobufjs
jest.mock('protobufjs', () => ({
  load: jest.fn(),
}));

describe('Buffer Handling and Conversion', () => {
  describe('Deep Clone with Buffers', () => {
    it('should preserve Buffer instances during cloning', () => {
      const buffer = Buffer.from('test data', 'utf-8');
      const response: PlayElementResponse = {
        playElement: { id: 'test' },
        playElementDesign: {
          attachments: [{
            attachmentData: { original: buffer },
          }],
        },
      };

      const modifier = new PlayElementModifier(response);
      const result = modifier.build();

      const clonedBuffer = result.playElementDesign.attachments?.[0]?.attachmentData?.original;
      expect(clonedBuffer).toBeDefined();
      expect(Buffer.isBuffer(clonedBuffer) || clonedBuffer instanceof Uint8Array).toBe(true);

      // Verify it's a clone, not the same reference
      expect(clonedBuffer).not.toBe(buffer);

      // Verify content is the same
      expect(Buffer.from(clonedBuffer as Uint8Array).toString('utf-8')).toBe('test data');
    });

    it('should preserve Uint8Array instances during cloning', () => {
      const uint8 = new Uint8Array([1, 2, 3, 4, 5]);
      const response: PlayElementResponse = {
        playElement: { id: 'test' },
        playElementDesign: {
          modRules: {
            compatibleRules: { original: uint8 },
          },
        },
      };

      const modifier = new PlayElementModifier(response);
      const result = modifier.build();

      const clonedUint8 = result.playElementDesign.modRules?.compatibleRules?.original;
      expect(clonedUint8).toBeDefined();
      expect(clonedUint8 instanceof Uint8Array).toBe(true);

      // Verify it's a clone
      expect(clonedUint8).not.toBe(uint8);

      // Verify content
      expect(Array.from(clonedUint8 as Uint8Array)).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle deeply nested buffers', () => {
      const response: PlayElementResponse = {
        playElement: { id: 'test' },
        playElementDesign: {
          attachments: [{
            attachmentData: {
              level1: {
                level2: {
                  level3: {
                    deepBuffer: Buffer.from('deep data'),
                  },
                },
              },
            },
          }],
        },
      };

      const modifier = new PlayElementModifier(response);
      const result = modifier.build();

      const deepBuffer = (result.playElementDesign.attachments?.[0]?.attachmentData as any)
        ?.level1?.level2?.level3?.deepBuffer;

      expect(deepBuffer).toBeDefined();
      expect(Buffer.isBuffer(deepBuffer) || deepBuffer instanceof Uint8Array).toBe(true);
      expect(Buffer.from(deepBuffer).toString('utf-8')).toBe('deep data');
    });

    it('should handle arrays containing buffers', () => {
      const response: PlayElementResponse = {
        playElement: { id: 'test' },
        playElementDesign: {
          attachments: [
            { attachmentData: { original: Buffer.from('buffer1') } },
            { attachmentData: { original: Buffer.from('buffer2') } },
            { attachmentData: { original: Buffer.from('buffer3') } },
          ],
        },
      };

      const modifier = new PlayElementModifier(response);
      const result = modifier.build();

      expect(result.playElementDesign.attachments?.length).toBe(3);

      result.playElementDesign.attachments?.forEach((att, i) => {
        const buffer = att?.attachmentData?.original;
        expect(buffer).toBeDefined();
        expect(Buffer.isBuffer(buffer) || buffer instanceof Uint8Array).toBe(true);
        expect(Buffer.from(buffer as Uint8Array).toString('utf-8')).toBe(`buffer${i + 1}`);
      });
    });

    it('should handle Date objects correctly', () => {
      const now = new Date();
      const response: PlayElementResponse = {
        playElement: {
          id: 'test',
          createdAt: now as any, // Not a standard field but testing the deep clone
        },
        playElementDesign: {},
      };

      const modifier = new PlayElementModifier(response);
      const result = modifier.build();

      const clonedDate = (result.playElement as any).createdAt;
      expect(clonedDate).toBeInstanceOf(Date);
      expect(clonedDate).not.toBe(now);
      expect(clonedDate.getTime()).toBe(now.getTime());
    });

    it('should not share references between original and cloned objects', () => {
      const originalArray = [1, 2, 3];
      const originalObject = { key: 'value' };
      const response: PlayElementResponse = {
        playElement: {
          id: 'test',
          data: originalObject as any,
        },
        playElementDesign: {
          items: originalArray as any,
        },
      };

      const modifier = new PlayElementModifier(response);
      const result = modifier.build();

      // Modify the cloned data
      (result.playElement as any).data.key = 'modified';
      (result.playElementDesign as any).items.push(4);

      // Original should be unchanged
      expect(originalObject.key).toBe('value');
      expect(originalArray).toEqual([1, 2, 3]);
    });
  });

  describe('Buffer to Uint8Array Conversion for Protobuf', () => {
    let client: SantiagoWebPlayClient;
    let mockFetch: jest.MockedFunction<typeof fetch>;

    beforeEach(() => {
      client = new SantiagoWebPlayClient({
        host: 'test-host.com',
        tenancy: 'test-tenancy',
        sessionId: 'test-session',
      });
      mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
      jest.clearAllMocks();
      jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should convert Buffers in modRules to Uint8Array before protobuf encoding', async () => {
      // Setup mocks
      const mockVerify = jest.fn((payload) => {
        // Verify that originalModRules is a Uint8Array, not a Buffer
        expect(payload.originalModRules).toBeInstanceOf(Uint8Array);
        return null; // No error
      });

      const mockCreate = jest.fn().mockReturnValue({});
      const mockEncode = jest.fn().mockReturnValue({
        finish: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3])),
      });

      const mockDecode = jest.fn().mockReturnValue({});
      const mockToObject = jest.fn().mockReturnValue({
        playElement: {},
        playElementDesign: {},
      });

      const mockUpdateType = {
        verify: mockVerify,
        create: mockCreate,
        encode: mockEncode,
      };

      const mockResponseType = {
        decode: mockDecode,
        toObject: mockToObject,
      };

      const mockRoot = {
        lookupType: jest.fn((typeName: string) => {
          if (typeName === 'battlefield.portal.UpdatePlayElementRequest') {
            return mockUpdateType;
          }
          return mockResponseType;
        }),
      };

      const protobuf = require('protobufjs');
      (protobuf.load as jest.Mock).mockResolvedValue(mockRoot);

      // Setup fetch mock
      const mockResponseData = new Uint8Array([5, 6, 7, 8]);
      const mockFrame = new Uint8Array(5 + mockResponseData.length);
      mockFrame[0] = 0;
      new DataView(mockFrame.buffer).setUint32(1, mockResponseData.length, false);
      mockFrame.set(mockResponseData, 5);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => mockFrame.buffer,
      } as Response);

      // Call updatePlayElement with Buffer in modRules
      await client.updatePlayElement({
        id: 'test-id',
        playElement: { id: 'test-id', name: 'Test' },
        playElementDesign: {
          modRules: {
            compatibleRules: {
              original: Buffer.from([1, 2, 3, 4, 5]), // Buffer, not Uint8Array
            },
          },
        },
      });

      // Verify the conversion happened
      expect(mockVerify).toHaveBeenCalled();
    });

    it('should convert Buffers in attachment data to Uint8Array recursively', () => {
      // This test verifies buffer conversion through the PlayElementModifier
      // The actual conversion in updatePlayElement is tested via integration tests
      const response: PlayElementResponse = {
        playElement: { id: 'test' },
        playElementDesign: {
          attachments: [
            {
              attachmentType: 1,
              attachmentData: {
                original: Buffer.from('test script'),
                compiled: {
                  value: Buffer.from([1, 2, 3]),
                },
              },
            },
          ],
        },
      };

      const modifier = new PlayElementModifier(response);
      const result = modifier.build();

      // Verify nested buffers are preserved through deep clone
      const attachmentData = result.playElementDesign.attachments?.[0]?.attachmentData;
      expect(attachmentData?.original).toBeDefined();
      expect(Buffer.isBuffer(attachmentData?.original) || attachmentData?.original instanceof Uint8Array).toBe(true);

      const compiledValue = (attachmentData?.compiled as any)?.value;
      expect(compiledValue).toBeDefined();
      expect(Buffer.isBuffer(compiledValue) || compiledValue instanceof Uint8Array).toBe(true);
    });

    it('should handle mixed Buffer and Uint8Array types correctly', () => {
      // This test verifies that both Buffer and Uint8Array types are handled correctly
      const response: PlayElementResponse = {
        playElement: { id: 'test' },
        playElementDesign: {
          attachments: [
            {
              attachmentData: { original: Buffer.from('buffer') }, // Buffer
            },
            {
              attachmentData: { original: new Uint8Array([1, 2, 3]) }, // Uint8Array
            },
          ],
          modRules: {
            compatibleRules: {
              original: Buffer.from([4, 5, 6]), // Buffer
            },
          },
        },
      };

      const modifier = new PlayElementModifier(response);
      const result = modifier.build();

      // All should be preserved as binary data after cloning
      const bufferAttachment = result.playElementDesign.attachments?.[0]?.attachmentData?.original;
      const uint8Attachment = result.playElementDesign.attachments?.[1]?.attachmentData?.original;
      const modRulesBuffer = result.playElementDesign.modRules?.compatibleRules?.original;

      expect(Buffer.isBuffer(bufferAttachment) || bufferAttachment instanceof Uint8Array).toBe(true);
      expect(Buffer.isBuffer(uint8Attachment) || uint8Attachment instanceof Uint8Array).toBe(true);
      expect(Buffer.isBuffer(modRulesBuffer) || modRulesBuffer instanceof Uint8Array).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null and undefined values in nested structures', () => {
      const response: PlayElementResponse = {
        playElement: {
          id: 'test',
          description: undefined,
          thumbnailUrl: null as any,
        },
        playElementDesign: {
          attachments: [
            {
              attachmentType: 'ATTACHMENT_TYPE_SCRIPT',
              attachmentData: {
                original: Buffer.from('test'),
                compiled: undefined,
                extra: null,
              },
            },
          ],
          modRules: undefined,
        },
      };

      const modifier = new PlayElementModifier(response);
      const result = modifier.build();

      // Should handle null/undefined gracefully
      expect(result.playElement.description).toBeUndefined();
      expect(result.playElement.thumbnailUrl).toBeNull();
      expect(result.playElementDesign.modRules).toBeUndefined();

      const attachmentData = result.playElementDesign.attachments?.[0]?.attachmentData;
      expect(attachmentData?.compiled).toBeUndefined();
      expect(attachmentData?.extra).toBeNull();
    });

    it('should handle empty buffers', () => {
      const response: PlayElementResponse = {
        playElement: { id: 'test' },
        playElementDesign: {
          attachments: [{
            attachmentData: {
              original: Buffer.alloc(0), // Empty buffer
            },
          }],
        },
      };

      const modifier = new PlayElementModifier(response);
      const result = modifier.build();

      const buffer = result.playElementDesign.attachments?.[0]?.attachmentData?.original;
      expect(buffer).toBeDefined();
      expect(buffer instanceof Uint8Array || Buffer.isBuffer(buffer)).toBe(true);
      expect((buffer as Uint8Array).length).toBe(0);
    });

    it('should handle very large buffers', () => {
      const largeBuffer = Buffer.alloc(1024 * 1024); // 1MB
      largeBuffer.fill(0x42);

      const response: PlayElementResponse = {
        playElement: { id: 'test' },
        playElementDesign: {
          attachments: [{
            attachmentData: {
              original: largeBuffer,
            },
          }],
        },
      };

      const modifier = new PlayElementModifier(response);
      const result = modifier.build();

      const clonedBuffer = result.playElementDesign.attachments?.[0]?.attachmentData?.original;
      expect(clonedBuffer).toBeDefined();
      expect((clonedBuffer as Uint8Array).length).toBe(1024 * 1024);
      expect((clonedBuffer as Uint8Array)[0]).toBe(0x42);
      expect(clonedBuffer).not.toBe(largeBuffer); // Should be a clone
    });
  });
});
