This page describes what data Periplo actually touches: on this site, in the demo and in the public testnet facilitator. It was written by reading the repository's code, not from a template.

## Who is responsible and how to contact them

No person or entity has been designated yet as responsible for this site and the public deployments. Until then, the project is maintained by its contributors ("Periplo contributors"). The current contact channel is to open an issue in the [public repository](https://github.com/Eras256/Periplo/issues); do not include personal data in it, because it is public. To report a vulnerability, use the [security](/en/security) page.

## What data is touched and why

### This site (periplo.xyz)

- **No accounts, no forms, no analytics.** The site asks for no sign-up, has no contact forms and loads no third-party analytics, advertising or tracking scripts. It does not load fonts or assets from other domains either: everything is served from the site itself.
- **One preference cookie, only if you choose it.** If you use the language switch, the site stores a first-party cookie (`periplo-locale`) with the language you picked, so your next visit opens in that language. It holds nothing else and lasts one year.
- **The theme stays in your browser.** If you pick the light or dark theme, the preference is kept in your browser's local storage (`localStorage`) so it is remembered on your next visit. It is never sent to any server, and you can clear it from your browser.
- **Technical data of each request.** As with any web page, the hosting provider processes technical data (such as the IP address and browser) in order to deliver the page.

### Facilitator live status

The live status section on the home page does not make your browser contact the facilitator. Your browser asks this site for the data (`/api/facilitator`), and the site's server queries the facilitator's `/supported` and `/status`, to show whether the service is up. That query does not forward your IP address or any data about you.

### The demo (/demo)

- **Real settlements:** your browser queries Stellar testnet's public RPC server (`soroban-testnet.stellar.org`) directly to read the contract's events and display them. That server receives your request like any other website you visit, with your IP address.
- **Simulation:** runs entirely in your browser. It sends nothing to any server, signs nothing and creates no transactions.

### The public testnet facilitator

This applies to anyone who uses the facilitator (`periplo-testnet.fly.dev`) from their own code, as a seller or a buyer:

- **What it receives:** the payment data sent to `/verify` and `/settle`: the transaction or authorization signed by the buyer, the Stellar addresses involved, the amount and the asset.
- **What for, and what it does with it:** to verify the payment and, on `/settle`, submit it to Stellar testnet. It verifies it in memory. **What is recorded on a blockchain is public and permanent**; neither Periplo nor anyone else can delete it.
- **What it keeps:** aggregate counters in memory (requests served, error rate, latencies) and the hash of the last settlement per network, shown at `/status`, to display the state of the service. They reset whenever the service restarts.
- **Discovery catalog:** when a settled payment declares the discovery (Bazaar) extension, the public data of the resource that was sold is stored in a database: its URL, description, parameters, price, asset and the address that receives the payment. It exists so others can find that resource; it is publicly searchable at `/discovery`. Nothing about the buyer is stored in the catalog.

## Who it is shared with

Each of these services has its own privacy policy, which governs what it does with the data it receives.

- **Vercel:** hosts this site and runs its server. It receives the technical data of each request to the site (such as the IP address and browser).
- **Fly.io:** hosts the public facilitator. It receives the requests that reach the facilitator, the technical data of each connection and the service's log output (see "Logs").
- **Stellar testnet public RPC server:** receives your request when the demo reads events from your browser (with your IP address), and receives the transactions the facilitator submits to Stellar testnet.
- **Catalog database:** the discovery catalog is stored in a database hosted on Supabase (only the resource's public data described above).
- **stellar.expert:** if you click a link to a transaction, you open that explorer's site, which belongs to a third party.

## How to ask for access or correction

- **On this site and in the demo** nothing that identifies you is stored on a server of the project; the language cookie and the theme preference are in your browser and you can clear them yourself.
- **In the discovery catalog** there is data about the resource a seller published (URL, description, parameters, price, asset and receiving address). If you want to know what is there about you, correct it or ask for it to be removed, write through the contact channel above stating the URL or the Stellar address of your resource. The team can correct or delete that entry, because the database is controlled by the project.
- **On the blockchain** nothing can be corrected or deleted: what is recorded on Stellar is public and permanent.

## Logs

Verified by reading the code of `apps/facilitator` on September 27, 2026:

- **There is no request log.** The service has no component that records each request, and its code does not write IP addresses or headers to its logs.
- **What it does write:** a message at startup (the address and port it listens on); warnings if loading the search model or processing a resource's discovery text fails (that warning includes the resource's URL); and errors in the `upto` flow (simulation failures, transaction parsing failures or unexpected ones), whose message can include details of the transaction that failed, such as Stellar addresses and amounts.
- **Where they end up:** on Fly.io, which receives that output. According to [Fly.io's documentation](https://docs.fly.io/monitoring/logging-overview/), its log search keeps 7 days and there is no long-term storage by default. Periplo did not configure any external log shipping service for this deployment.

## Who controls the funds

Periplo does not receive, hold or move anyone's funds. The buyer signs each payment with their own key, and the facilitator only pays Stellar testnet network fees from its own account. It has no fiat rail, neither its own nor a third party's.
