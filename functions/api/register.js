// GitHub 저장소에 이 경로로 업로드: functions/api/register.js
// Cloudflare Pages가 자동으로 API 엔드포인트로 만들어줍니다

export async function onRequestPost(context) {
  const { request, env } = context;
  
  // CORS 헤더
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const data = await request.json();
    const { subdomain, extension, nameservers, email } = data;

    // 입력 검증
    if (!subdomain || !extension || !nameservers || !email) {
      return new Response(JSON.stringify({ 
        error: '필수 정보가 누락되었습니다.' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (nameservers.length < 2 || nameservers.length > 4) {
      return new Response(JSON.stringify({ 
        error: '네임서버는 2~4개 사이로 입력해주세요.' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // 도메인 형식 검증
    const domainRegex = /^[a-z0-9-]+$/;
    if (!domainRegex.test(subdomain)) {
      return new Response(JSON.stringify({ 
        error: '도메인은 영문 소문자, 숫자, 하이픈만 사용 가능합니다.' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (subdomain.length < 3 || subdomain.length > 63) {
      return new Response(JSON.stringify({ 
        error: '도메인은 3~63자 사이여야 합니다.' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const fullDomain = subdomain + extension;

    // KV에서 중복 체크
    const DOMAIN_KV = env.DOMAIN_KV;
    const existing = await DOMAIN_KV.get(fullDomain);
    
    if (existing) {
      return new Response(JSON.stringify({ 
        error: '이미 등록된 도메인입니다.' 
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Cloudflare API로 DNS 레코드 생성
    const CF_API_TOKEN = env.CF_API_TOKEN;
    const CF_ZONE_ID = env.CF_ZONE_ID;

    if (!CF_API_TOKEN || !CF_ZONE_ID) {
      return new Response(JSON.stringify({ 
        error: 'Cloudflare API 설정이 필요합니다. 환경 변수를 확인하세요.' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // 각 네임서버에 대해 NS 레코드 생성
    for (let i = 0; i < nameservers.length; i++) {
      const ns = nameservers[i];
      
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${CF_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'NS',
            name: fullDomain,
            content: ns,
            ttl: 3600
          })
        }
      );

      const result = await response.json();
      
      if (!result.success) {
        return new Response(JSON.stringify({ 
          error: 'DNS 레코드 생성 실패: ' + (result.errors?.[0]?.message || '알 수 없는 오류') 
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // KV에 도메인 정보 저장
    const domainInfo = {
      subdomain,
      extension,
      fullDomain,
      nameservers,
      email,
      registeredAt: new Date().toISOString(),
      status: 'active'
    };

    await DOMAIN_KV.put(fullDomain, JSON.stringify(domainInfo));

    // 성공 응답
    return new Response(JSON.stringify({
      success: true,
      domain: fullDomain,
      nameservers,
      message: '도메인이 성공적으로 등록되었습니다.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: '서버 오류: ' + error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

// OPTIONS 요청 처리 (CORS preflight)
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
      }
