This page describes what data Periplo actually touches: on this site, in the demo and in the public testnet facilitator. It was written by reading the repository's code, not from a template.

## This site (periplo.xyz)

- **No accounts, no forms, no analytics.** The site asks for no sign-up, has no contact forms and loads no third-party analytics, advertising or tracking scripts. It does not load fonts or assets from other domains either: everything is served from the site itself.
- **One preference cookie, only if you choose it.** If you use the language switch, the site stores a first-party cookie (`periplo-locale`) with the language you picked, so your next visit opens in that language. It holds nothing else and lasts one year.
- **The theme stays in your browser.** If you pick the light or dark theme, the preference is kept in your browser's local storage (`localStorage`). It is never sent to any server, and you can clear it from your browser.
- **Hosting.** The site is served from Vercel. As with any web page, the hosting provider processes technical data about each request (such as the IP address and browser) in order to deliver it, under its own privacy policy.

## Facilitator live status

The live status section on the home page does not make your browser contact the facilitator. Your browser asks this site for the data (`/api/facilitator`), and the site's server queries the facilitator's `/supported` and `/status`. That query does not forward your IP address or any data about you.

## The demo (/demo)

- **Real settlements:** your browser queries Stellar testnet's public RPC server (`soroban-testnet.stellar.org`) directly to read the contract's events. That server receives your request like any other website you visit, with your IP address.
- **Simulation:** runs entirely in your browser. It sends nothing to any server, signs nothing and creates no transactions.

## The public testnet facilitator

This applies to anyone who uses the facilitator (`periplo-testnet.fly.dev`) from their own code, as a seller or a buyer:

- **What it receives:** the payment data sent to `/verify` and `/settle`: the transaction or authorization signed by the buyer, the Stellar addresses involved, the amount and the asset.
- **What it does with it:** it verifies it in memory and, on `/settle`, submits the transaction to Stellar testnet. **What is recorded on a blockchain is public and permanent**; neither Periplo nor anyone else can delete it.
- **What it keeps:** aggregate counters in memory (requests served, error rate, latencies) and the hash of the last settlement per network, shown at `/status`. They reset whenever the service restarts.
- **Logs:** the code does not log each request. It writes messages at startup and when a warning or an error occurs; an error message can include details of the transaction that failed. The service runs on Fly.io, which receives that output and the technical data of each connection under its own policy.
- **Discovery catalog:** when a settled payment declares the discovery (Bazaar) extension, the public data of the resource that was sold is stored in a database: its URL, description, parameters, price, asset and the address that receives the payment. That catalog is publicly searchable at `/discovery`. Nothing about the buyer is stored in the catalog.

## Custody

Periplo does not receive, hold or move anyone's funds. The facilitator only pays Stellar testnet network fees from its own account. It has no fiat rail, neither its own nor a third party's.

## Questions

Periplo is an open-source project maintained by its contributors. For questions about this page, open an issue in the [public repository](https://github.com/Eras256/Periplo).
