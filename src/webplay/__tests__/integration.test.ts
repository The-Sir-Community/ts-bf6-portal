/**
 * Integration tests for issues discovered during live testing
 * These tests catch bugs that weren't caught by unit tests
 */

import * as path from 'path';
import * as fs from 'fs';
import { PlayElementModifier } from '../playweb-client';
import type { PlayElementResponse } from '../playweb-client';

describe('Integration Tests - Real World Scenarios', () => {
  describe('Proto file path resolution', () => {
    it('should resolve proto file path correctly from src directory', () => {
      // This test ensures the proto file can be found from the source directory
      const protoPath = path.resolve(__dirname, '../../battlefield_portal.proto');
      expect(fs.existsSync(protoPath)).toBe(true);
    });

    it('should resolve proto file path correctly from dist directory', () => {
      // This simulates running from the compiled dist directory
      // The path should be '../battlefield_portal.proto' from dist/
      const distDir = path.resolve(__dirname, '../../dist');
      const protoPath = path.resolve(distDir, '../battlefield_portal.proto');
      expect(fs.existsSync(protoPath)).toBe(true);
    });

    it('should use the correct relative path in playweb-client', () => {
      // Read the source file and verify the path
      const sourceFile = fs.readFileSync(
        path.resolve(__dirname, '../playweb-client.ts'),
        'utf-8'
      );

      // Should contain the correct relative path
      expect(sourceFile).toContain("__dirname, '../battlefield_portal.proto'");
      // Should NOT contain the incorrect path
      expect(sourceFile).not.toContain("__dirname, 'battlefield_portal.proto'");
    });
  });

  describe('Buffer and Uint8Array handling', () => {
    it('should preserve Buffers when deep cloning', () => {
      const response: PlayElementResponse = {
        playElement: {
          id: 'test-id',
          name: 'Test Element',
        },
        playElementDesign: {
          attachments: [
            {
              attachmentType: 'ATTACHMENT_TYPE_SCRIPT',
              attachmentData: {
                original: Buffer.from('test script content', 'utf-8'),
              },
            },
          ],
          modRules: {
            compatibleRules: {
              original: Buffer.from([1, 2, 3, 4, 5]),
            },
          },
        },
      };

      const modifier = new PlayElementModifier(response);
      const result = modifier.build();

      // Verify the original buffer is preserved (as Buffer or Uint8Array)
      const scriptBuffer = result.playElementDesign.attachments?.[0]?.attachmentData?.original;
      expect(scriptBuffer).toBeDefined();
      expect(scriptBuffer instanceof Uint8Array || Buffer.isBuffer(scriptBuffer)).toBe(true);

      // Verify content is preserved
      const content = Buffer.from(scriptBuffer as Uint8Array).toString('utf-8');
      expect(content).toBe('test script content');

      // Verify modRules buffer is preserved
      const modRulesBuffer = result.playElementDesign.modRules?.compatibleRules?.original;
      expect(modRulesBuffer).toBeDefined();
      expect(modRulesBuffer instanceof Uint8Array || Buffer.isBuffer(modRulesBuffer)).toBe(true);
    });

    it('should handle nested buffers in attachment data', () => {
      const response: PlayElementResponse = {
        playElement: {
          id: 'test-id',
          name: 'Test Element',
        },
        playElementDesign: {
          attachments: [
            {
              attachmentType: 'ATTACHMENT_TYPE_SCRIPT',
              attachmentData: {
                original: Buffer.from('original content', 'utf-8'),
                compiled: {
                  value: Buffer.from('compiled content', 'utf-8'),
                },
                metadata: {
                  nested: {
                    deepBuffer: Buffer.from([1, 2, 3]),
                  },
                },
              },
            },
          ],
        },
      };

      const modifier = new PlayElementModifier(response);
      const result = modifier.build();

      // All nested buffers should be preserved
      const attachmentData = result.playElementDesign.attachments?.[0]?.attachmentData;
      expect(attachmentData?.original).toBeDefined();
      expect(attachmentData?.compiled).toBeDefined();
      expect((attachmentData?.metadata as any)?.nested?.deepBuffer).toBeDefined();
    });

    it('should not lose buffer data when using JSON.parse/stringify', () => {
      // This test documents the bug: JSON.parse/stringify loses Buffer data
      const bufferObj = {
        data: Buffer.from('test data', 'utf-8'),
      };

      // JSON.parse/stringify converts Buffer to a plain object with numeric properties
      const jsonCloned = JSON.parse(JSON.stringify(bufferObj));

      // This is what was happening - buffer becomes an object like {type: 'Buffer', data: [1,2,3]}
      expect(jsonCloned.data).toBeDefined();
      expect(Buffer.isBuffer(jsonCloned.data)).toBe(false);

      // The proper deep clone should preserve it
      const modifier = new PlayElementModifier({
        playElement: {},
        playElementDesign: {
          attachments: [{
            attachmentData: bufferObj as any,
          }],
        },
      });

      const result = modifier.build();
      const clonedData = result.playElementDesign.attachments?.[0]?.attachmentData?.data;

      // Should still be a Buffer or Uint8Array
      expect(clonedData instanceof Uint8Array || Buffer.isBuffer(clonedData)).toBe(true);
    });

    it('should handle mixed Buffer and Uint8Array types', () => {
      const response: PlayElementResponse = {
        playElement: {
          id: 'test-id',
        },
        playElementDesign: {
          attachments: [
            {
              attachmentType: 'ATTACHMENT_TYPE_SCRIPT',
              attachmentData: {
                original: Buffer.from('buffer content'),
              },
            },
            {
              attachmentType: 'ATTACHMENT_TYPE_OTHER',
              attachmentData: {
                original: new Uint8Array([1, 2, 3, 4]),
              },
            },
          ],
        },
      };

      const modifier = new PlayElementModifier(response);
      const result = modifier.build();

      // Both should be preserved as binary data
      const bufferAttachment = result.playElementDesign.attachments?.[0]?.attachmentData?.original;
      const uint8Attachment = result.playElementDesign.attachments?.[1]?.attachmentData?.original;

      expect(bufferAttachment instanceof Uint8Array || Buffer.isBuffer(bufferAttachment)).toBe(true);
      expect(uint8Attachment instanceof Uint8Array || Buffer.isBuffer(uint8Attachment)).toBe(true);
    });
  });

  describe('Enum compatibility', () => {
    it('should preserve numeric enum values for round-trip', () => {
      // When data comes from protobuf with numeric enums, they should stay numeric
      const response: PlayElementResponse = {
        playElement: {
          id: 'test-id',
          name: 'Test',
          publishStateType: 1, // Numeric enum value
        },
        playElementDesign: {
          attachments: [
            {
              attachmentType: 1, // Numeric enum value, not 'ATTACHMENT_TYPE_SCRIPT'
              attachmentData: {
                original: Buffer.from('test'),
              },
            },
          ],
          mapRotation: {
            attributes: {
              rotationBehavior: 2, // Numeric enum
            },
          },
        },
      };

      const modifier = new PlayElementModifier(response);
      const result = modifier.build();

      // Enum values should remain as numbers
      expect(typeof result.playElement.publishStateType).toBe('number');
      expect(result.playElement.publishStateType).toBe(1);
      expect(typeof result.playElementDesign.attachments?.[0]?.attachmentType).toBe('number');
    });

    it('should handle string enum values from user modifications', () => {
      const response: PlayElementResponse = {
        playElement: {
          id: 'test-id',
        },
        playElementDesign: {
          attachments: [
            {
              attachmentType: 'ATTACHMENT_TYPE_SPATIAL', // String enum
              attachmentData: {
                original: Buffer.from('test'),
              },
            },
          ],
        },
      };

      const modifier = new PlayElementModifier(response);
      modifier.setScript('new script content');

      const result = modifier.build();

      // Should still work - the attachment was found by checking both string and numeric
      const scriptBuffer = result.playElementDesign.attachments?.[0]?.attachmentData?.original;
      expect(Buffer.from(scriptBuffer as Uint8Array).toString('utf-8')).toBe('new script content');
    });
  });

  describe('Real-world data structures', () => {
    it('should handle complex nested structures with multiple buffers', () => {
      // Simulate real data from the Santiago server
      const realWorldResponse: PlayElementResponse = {
        playElement: {
          id: '8c072c80-a645-11f0-ad08-a51df09efdf2',
          name: 'MyExp',
          description: { value: 'Test description' },
          thumbnailUrl: { value: 'https://example.com/thumb.jpg' },
          publishStateType: 1,
          playElementSettings: {},
        },
        playElementDesign: {
          attachments: [
            {
              attachmentType: 1,
              attachmentData: {
                original: Buffer.from('// Original script\nconsole.log("test");', 'utf-8'),
                compiled: {
                  value: Buffer.from([0x1, 0x2, 0x3, 0x4]),
                },
              },
              errors: [],
            },
            {
              attachmentType: 2,
              attachmentData: {
                original: Buffer.from('attachment 2 data'),
              },
              errors: [],
            },
          ],
          designMetadata: {
            version: 1,
            author: 'test',
          },
          mapRotation: {
            attributes: {
              rotationBehavior: 0,
              someValue: 42,
            },
          },
          mutators: [
            { type: 1, enabled: true },
            { type: 2, enabled: false },
          ],
          assetCategories: ['category1', 'category2'] as any,
          modRules: {
            compatibleRules: {
              original: Buffer.from([0x10, 0x20, 0x30, 0x40, 0x50]),
            },
          },
          modLevelDataId: { value: 'level-data-id-123' },
        },
      };

      const modifier = new PlayElementModifier(realWorldResponse);

      // Make modifications
      modifier
        .setName('Updated Name')
        .setScript('// Updated script\nconsole.log("updated");');

      const result = modifier.build();

      // Verify all data is preserved
      expect(result.playElement.name).toBe('Updated Name');
      expect(result.playElement.publishStateType).toBe(1);
      expect(result.playElementDesign.attachments?.length).toBe(2);
      expect(result.playElementDesign.mutators?.length).toBe(2);
      expect(result.playElementDesign.assetCategories?.length).toBe(2);

      // Verify buffers are preserved
      const scriptBuffer = result.playElementDesign.attachments?.[0]?.attachmentData?.original;
      expect(Buffer.from(scriptBuffer as Uint8Array).toString('utf-8')).toBe(
        '// Updated script\nconsole.log("updated");'
      );

      const modRulesBuffer = result.playElementDesign.modRules?.compatibleRules?.original;
      expect(modRulesBuffer).toBeDefined();
      expect(modRulesBuffer instanceof Uint8Array || Buffer.isBuffer(modRulesBuffer)).toBe(true);

      // Verify nested structures
      expect(result.playElementDesign.mapRotation).toBeDefined();
      expect(result.playElementDesign.designMetadata).toBeDefined();
      expect(result.playElementDesign.modLevelDataId).toEqual({ value: 'level-data-id-123' });
    });

    it('should handle empty and undefined fields correctly', () => {
      const sparseResponse: PlayElementResponse = {
        playElement: {
          id: 'test-id',
          name: 'Test',
          // description is undefined
          // thumbnailUrl is undefined
          // playElementSettings is undefined
        },
        playElementDesign: {
          attachments: [
            {
              attachmentType: 'ATTACHMENT_TYPE_SCRIPT',
              attachmentData: {
                original: Buffer.from('test script'),
                // compiled is undefined
              },
              // errors is undefined
            },
          ],
          // designMetadata is undefined
          // mapRotation is undefined
          mutators: [], // Empty array
          assetCategories: [], // Empty array
          // modRules is undefined
        },
      };

      const modifier = new PlayElementModifier(sparseResponse);
      const result = modifier.build();

      // Should handle undefined fields gracefully
      expect(result.playElement.description).toBeUndefined();
      expect(result.playElement.thumbnailUrl).toBeUndefined();
      expect(result.playElementDesign.designMetadata).toBeUndefined();
      expect(result.playElementDesign.mapRotation).toBeUndefined();
      expect(result.playElementDesign.modRules).toBeUndefined();

      // Empty arrays should be preserved
      expect(Array.isArray(result.playElementDesign.mutators)).toBe(true);
      expect(result.playElementDesign.mutators?.length).toBe(0);
    });
  });

  describe('Immutability guarantees', () => {
    it('should not modify original data when cloning with buffers', () => {
      const originalBuffer = Buffer.from('original content');
      const response: PlayElementResponse = {
        playElement: {
          id: 'test-id',
          name: 'Original Name',
        },
        playElementDesign: {
          attachments: [
            {
              attachmentType: 'ATTACHMENT_TYPE_SPATIAL',
              attachmentData: {
                original: originalBuffer,
              },
            },
          ],
        },
      };

      const modifier = new PlayElementModifier(response);
      modifier.setScript('modified content');
      modifier.setName('Modified Name');

      // Original should be unchanged
      expect(response.playElement?.name).toBe('Original Name');
      expect(response.playElementDesign?.attachments?.[0]?.attachmentData?.original).toBe(originalBuffer);
      expect(originalBuffer.toString('utf-8')).toBe('original content');
    });

    it('should allow multiple independent modifications', () => {
      const response: PlayElementResponse = {
        playElement: {
          id: 'test-id',
          name: 'Original',
        },
        playElementDesign: {
          attachments: [
            {
              attachmentType: 'ATTACHMENT_TYPE_SPATIAL',
              attachmentData: {
                original: Buffer.from('original'),
              },
            },
          ],
        },
      };

      const modifier1 = new PlayElementModifier(response);
      const modifier2 = new PlayElementModifier(response);

      modifier1.setScript('script 1');
      modifier2.setScript('script 2');

      const result1 = modifier1.build();
      const result2 = modifier2.build();

      // Each modifier should have independent modifications
      const script1Buffer = result1.playElementDesign.attachments?.[0]?.attachmentData?.original;
      const script2Buffer = result2.playElementDesign.attachments?.[0]?.attachmentData?.original;

      expect(script1Buffer).toBeDefined();
      expect(script2Buffer).toBeDefined();

      const script1 = Buffer.from(script1Buffer as Uint8Array).toString('utf-8');
      const script2 = Buffer.from(script2Buffer as Uint8Array).toString('utf-8');

      expect(script1).toBe('script 1');
      expect(script2).toBe('script 2');
    });
  });
});
