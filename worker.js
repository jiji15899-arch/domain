// Cloudflare Worker - API 엔드포인트
// 환경 변수 필요: DOMAIN_KV (KV 네임스페이스), CF_API_TOKEN, CF_ZONE_ID

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  
  // CORS 헤더
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // API 라우팅
  if (url.pathname === '/api/register' && request.method === 'POST') {
    return handleRegister(request, corsHeaders)
  }

  if (url.pathname === '/api/check' && request.method === 'GET') {
    return handleCheck(url, corsHeaders)
  }

  return new Response('Not Found', { status: 404 })
}

async function handleRegister(request, corsHeaders) {
  try {
    const data = await request.json()
    const { subdomain, extension, nameservers, email } = data

    // 입력 검증
    if (!subdomain || !extension || !nameservers || !email) {
      return jsonResponse({ error: '필수 정보가 누락되었습니다.' }, 400, corsHeaders)
    }

    if (nameservers.length < 2 || nameservers.length > 4) {
      return jsonResponse({ error: '네임서버는 2~4개 사이로 입력해주세요.' }, 400, corsHeaders)
    }

    // 도메인 형식 검증
    const domainRegex = /^[a-z0-9-]+$/
    if (!domainRegex.test(subdomain)) {
      return jsonResponse({ error: '도메인은 영문 소문자, 숫자, 하이픈만 사용 가능합니다.' }, 400, corsHeaders)
    }

    if (subdomain.length < 3 || subdomain.length > 63) {
      return jsonResponse({ error: '도메인은 3~63자 사이여야 합니다.' }, 400, corsHeaders)
    }

    const fullDomain = subdomain + extension

    // 중복 체크 (KV 스토어)
    const existing = await DOMAIN_KV.get(fullDomain)
    if (existing) {
      return jsonResponse({ error: '이미 등록된 도메인입니다.' }, 409, corsHeaders)
    }

    // Cloudflare DNS 레코드 생성
    const dnsCreated = await createDNSRecords(fullDomain, nameservers)
    
    if (!dnsCreated.success) {
      return jsonResponse({ error: 'DNS 설정 실패: ' + dnsCreated.error }, 500, corsHeaders)
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
    }

    await DOMAIN_KV.put(fullDomain, JSON.stringify(domainInfo))

    // 성공 응답
    return jsonResponse({
      success: true,
      domain: fullDomain,
      nameservers,
      message: '도메인이 성공적으로 등록되었습니다.'
    }, 200, corsHeaders)

  } catch (error) {
    return jsonResponse({ error: '서버 오류: ' + error.message }, 500, corsHeaders)
  }
}

async function handleCheck(url, corsHeaders) {
  const domain = url.searchParams.get('domain')
  
  if (!domain) {
    return jsonResponse({ error: '도메인을 입력해주세요.' }, 400, corsHeaders)
  }

  const existing = await DOMAIN_KV.get(domain)
  
  return jsonResponse({
    available: !existing,
    domain
  }, 200, corsHeaders)
}

async function createDNSRecords(domain, nameservers) {
  try {
    const CF_API_TOKEN = globalThis.55ea199daf1b46f1b7869d544ed10c36 || ''
    const CF_ZONE_ID = globalThis.d5c67a7f0c791d39dbce41c3aa5d2221 || ''

    if (!CF_API_TOKEN || !CF_ZONE_ID) {
      return { success: false, error: 'Cloudflare API 설정이 필요합니다.' }
    }

    // NS 레코드 생성
    for (let i = 0; i < nameservers.length; i++) {
      const ns = nameservers[i]
      
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
            name: domain,
            content: ns,
            ttl: 3600
          })
        }
      )

      const result = await response.json()
      
      if (!result.success) {
        return { 
          success: false, 
          error: result.errors?.[0]?.message || 'DNS 레코드 생성 실패' 
        }
      }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

function jsonResponse(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  })
          }
