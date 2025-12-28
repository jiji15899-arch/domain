// GitHub 저장소에 이 경로로 업로드: functions/api/check.js

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const domain = url.searchParams.get('domain');
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (!domain) {
    return new Response(JSON.stringify({ 
      error: '도메인을 입력해주세요.' 
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const DOMAIN_KV = env.DOMAIN_KV;
  const existing = await DOMAIN_KV.get(domain);
  
  return new Response(JSON.stringify({
    available: !existing,
    domain
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
