import { TriageService } from '../modules/incidents/triageService.js';

async function testTriage() {
  console.log('Testing TriageService with Claude 3.5 Haiku...');

  const prompt = 'Elderly man collapsed at Akurdi railway station, clutching chest, severe breathlessness';
  const result = await TriageService.parseIncident(prompt);

  console.log('Triage Result:');
  console.log(JSON.stringify(result, null, 2));

  if (result.requirements.length > 0) {
    console.log('✅ Triage successfully parsed clinical requirements!');
  } else {
    console.error('❌ Failed to parse requirements');
    process.exit(1);
  }
}

testTriage().catch(console.error);
