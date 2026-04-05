async function test() {
  try {
    const url = 'https://flow-ai-beta-endpoint.onrender.com/api/trigger/95dadc32-72e7-4a28-a0e6-ee3cd58462a9';
    console.log('Testing URL:', url);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true })
    });
    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Body:', text.substring(0, 500));
  } catch (e) {
    console.error(e);
  }
}
test();
