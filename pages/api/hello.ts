import type { NextApiRequest, NextApiResponse } from 'next'
import puppeteer from 'puppeteer'

const IGNORE_LIST = ['google-analytics.com', 'doubleclick.net', 'sentry.io']

const SITES = [
  'https://info.uniswap.org/',
  'https://pancakeswap.finance/info',
  'https://curve.fi/combinedstats',
  'https://app.anchorprotocol.com/',
  'https://www.convexfinance.com/stake',
  'https://app.aave.com/markets/',
  'https://compound.finance/markets',
]

// Do NOT include .js otherwise data requests are not intercepted
const ABORT_RESOURCE_SUFFIXES: string[] = [
  '.png',
  '.jpg',
  '.css',
  '.svg',
  '.ico',
]

// TODO: add field isInternal
type Data = {
  siteUrl: string
  interceptedUrls: {
    domain: string
    url: string
  }[]
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data[]>
) {
  const result = await getInterceptedRequestsByUrls(SITES)
  const body: Data[] = Object.entries(result)
    .map(([url, intercepted]) => {
      const filterInIntercepted = intercepted.filter(
        (x) => !IGNORE_LIST.some((y) => getDomain(x).endsWith(y))
      )
      return [url, filterInIntercepted] as [string, string[]]
    })
    .map(([url, intercepted]) => ({
      siteUrl: url,
      interceptedUrls: intercepted.map((interceptedUrl) => ({
        domain: getDomain(interceptedUrl),
        url: interceptedUrl,
      })),
    }))
  res.status(200).json(body)
}

async function getInterceptedRequestsByUrls(
  urls: string[]
): Promise<{ [url: string]: string[] }> {
  const promises = urls.map((url) => getInterceptedRequestsByUrl(url))
  const results = await Promise.allSettled(promises)
  const map: { [url: string]: string[] } = {}
  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      map[result.value.url] = result.value.intercepted
    } else {
      console.error('failed to get intercepted: %s', result.reason)
    }
  })
  return map
}

async function getInterceptedRequestsByUrl(
  url: string
): Promise<{ url: string; intercepted: string[] }> {
  const result: string[] = []
  const browser = await puppeteer.launch()
  const page = await browser.newPage()
  await page.setRequestInterception(true)
  page.on('request', (interceptedRequest) => {
    if (interceptedRequest.isInterceptResolutionHandled()) {
      return
    }
    if (
      ABORT_RESOURCE_SUFFIXES.some((suffix) =>
        interceptedRequest.url().endsWith(suffix)
      )
    ) {
      interceptedRequest.abort()
    } else {
      // console.log("----")
      // console.log(interceptedRequest.resourceType())
      // console.log(interceptedRequest.url())
      // console.log(interceptedRequest.method())
      if (
        interceptedRequest.resourceType() === 'fetch' ||
        interceptedRequest.resourceType() === 'xhr'
      ) {
        result.push(interceptedRequest.url())
      }
      interceptedRequest.continue()
    }
  })
  await page.goto(url, { waitUntil: 'networkidle0' })
  await browser.close()
  return { url, intercepted: Array.from(new Set(result)) }
}

function getDomain(url: string): string {
  let domain = new URL(url)
  return domain.hostname.replace('www.', '')
}
