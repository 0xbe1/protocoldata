import type { NextPage } from 'next'
import Head from 'next/head'
import puppeteer from 'puppeteer'
import _ from 'lodash'

const IGNORE_LIST = [
  'google-analytics.com',
  'doubleclick.net',
  'sentry.io',
  'unpkg.com',
]

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

type DataUrlGroup = {
  domain: string
  dataUrls: string[]
}

type Data = {
  siteUrl: string
  dataUrlGroups: DataUrlGroup[]
}

const Home: NextPage<{ data: Data[] }> = ({ data }) => {
  return (
    <div className="flex min-h-screen flex-col items-center font-mono">
      <Head>
        <title>dedata</title>
        <link rel="icon" href="/favicon.ico" />
        {/* <script
          data-token="VLESW6URT5L5"
          async
          src="https://cdn.splitbee.io/sb.js"
        ></script> */}
      </Head>

      <main className="flex w-full flex-1 items-center sm:w-4/5 lg:w-1/2">
        <div className="w-full">
          <div className="">
            <p className="bg-gradient-to-tr from-purple-600 to-blue-600 bg-clip-text text-6xl font-bold text-transparent">
              dedata
            </p>
            <p className="mt-5 text-xl">
              Understand contracts{' '}
              <span className="font-bold text-purple-600">easily</span>
            </p>
            <div>
              {data.map((x) => (
                <Protocol siteUrl={x.siteUrl} dataUrlGroups={x.dataUrlGroups} />
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="flex h-16 w-full items-center justify-center border-t">
        By&nbsp;
        <a className="text-purple-600" href="https://github.com/0xbe1">
          @0xbe1
        </a>
        &nbsp;
        <a href="https://github.com/0xbe1/miniscan">
          <img src="github.svg" alt="GitHub" className="h-6" />
        </a>
        &nbsp;|&nbsp;Questions?&nbsp;
        <a href="https://discord.gg/u5KUjNZ8wy">
          <img src="discord.svg" alt="Discord" className="h-6" />
        </a>
        &nbsp;
        <a href="https://twitter.com/_0xbe1/status/1511638106554134530">
          <img src="twitter.svg" alt="Twitter" className="h-6" />
        </a>
        &nbsp;
        <a href="https://www.reddit.com/r/thegraph/comments/txi4c6/announcing_startblock_find_a_contracts_startblock/">
          <img src="reddit.svg" alt="Reddit" className="h-6" />
        </a>
        &nbsp;|&nbsp;Powered by&nbsp;
        <a href="https://etherscan.io/">
          <img src="etherscan.svg" alt="Etherscan" className="h-6" />
        </a>
      </footer>
    </div>
  )
}

const Protocol = ({ siteUrl, dataUrlGroups }: Data) => {
  const siteSecondLevelDomain = new URL(siteUrl).hostname
    .split('.')
    .slice(-2)
    .join('.')
  return (
    <div>
      <div className="text-red-500">{siteUrl}</div>
      {dataUrlGroups
        .filter(
          (g) =>
            g.domain.split('.').slice(-2).join('.') !== siteSecondLevelDomain
        )
        .map((g) => (
          <div>
            <div>- {g.domain}</div>
            {_.uniqBy(g.dataUrls, (url) => new URL(url).pathname).map((url) => (
              <div>&nbsp;&nbsp;- {new URL(url).pathname}</div>
            ))}
          </div>
        ))}
    </div>
  )
}

export async function getStaticProps() {
  const result = await getInterceptedRequestsByUrls(SITES)
  const data = Object.entries(result)
    .map(([url, intercepted]) => {
      const filterInIntercepted = intercepted.filter(
        (x) => !IGNORE_LIST.some((y) => getDomain(x).endsWith(y))
      )
      return [url, filterInIntercepted] as [string, string[]]
    })
    .map(([url, intercepted]) => {
      const dataUrlGroups = intercepted.reduce<DataUrlGroup[]>((acc, curr) => {
        const domain = getDomain(curr)
        const dataUrlGroup = acc.find((x) => x.domain === domain)
        if (dataUrlGroup === undefined) {
          acc.push({ domain, dataUrls: [curr] })
        } else {
          dataUrlGroup.dataUrls.push(curr)
        }
        return acc
      }, [] as DataUrlGroup[])

      return { siteUrl: url, dataUrlGroups }
    })

  return {
    props: {
      data,
    },
  }
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

export default Home
