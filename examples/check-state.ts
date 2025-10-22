import { SantiagoWebPlayClient } from '../src';

async function checkState() {
  const client = new SantiagoWebPlayClient({
    sessionId: 'web-00000000-0000-0000-0000-000000000000',
  });

  const playElementId = '00000000-0000-0000-0000-000000000000';

  const response = await client.getPlayElementDecoded({
    id: playElementId,
    includeDenied: true,
  });

  console.log('Current State:');
  console.log('  PlayElement ID:', response.playElement?.id);
  console.log('  Design ID:', response.playElement?.designId);
  console.log('  Name:', response.playElement?.name);
  console.log('  Publish State:', response.playElement?.publishStateType, '(1=DRAFT, 2=PUBLISHED, 4=ERROR)');
  console.log('  Short Code:', (response.playElement as any)?.shortCode?.value ?? '<none>');

  console.log('\nAttachments:');
  response.playElementDesign?.attachments?.forEach((att: any, idx: number) => {
    console.log(`  [${idx}] ${att.filename?.value} (Type ${att.attachmentType})`);
    console.log(`      Status: ${att.processingStatus} (1=PENDING, 2=PROCESSED, 4=ERROR)`);
    console.log(`      Errors: ${att.errors?.length ?? 0}`);
    console.log(`      Metadata: ${att.metadata?.value ?? '<none>'}`);

    if (att.attachmentData?.original) {
      const content = Buffer.from(att.attachmentData.original).toString('utf8');
      console.log(`      Content size: ${content.length} bytes`);

      if (att.attachmentType === 2) {
        // Type 2 is code - show preview
        console.log(`      Code preview (first 100 chars):`);
        console.log(`      ${content.substring(0, 100).replace(/\n/g, '\\n')}`);
      }
    }
  });

  console.log('\nMod Level Data ID:');
  if (response.playElementDesign?.modLevelDataId) {
    console.log('  ', JSON.stringify(response.playElementDesign.modLevelDataId));
  } else {
    console.log('  <No mod level data ID>');
  }

  console.log('\nMap Rotation:');
  if (response.playElementDesign?.mapRotation) {
    console.log(JSON.stringify(response.playElementDesign.mapRotation, null, 2));
  } else {
    console.log('  <No map rotation data>');
  }

  console.log('\nTo view in web portal:');
  console.log('  URL: https://portal.battlefield.com/bf6/experience/rules?playgroundId=' + playElementId);
  console.log('  Note: If publish state is DRAFT, you may need to publish it to see changes publicly');
}

checkState();
