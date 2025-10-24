Latest fixes:
Changed Highlighted Pair color and made names black for better visibility.
Added choice of theme colors and fonts.
Centered AMM pool pricing.
Fixed Latest Swap (single latest swap) to Latest position (adds up if in same direction).
Added Update Swaps button (useful for sequential swapping, leave off).
Added auto hex to ascii display of currency mapping names.
Added token details metadata (a few things to work on yet).
Added live prices to Token Position.
Calculates amount of profit/loss in xrp
This will now be in testing for a while.
See screenshot of actual account.  (App Screenshot.jpg)

Direct link...

To be added later today

Started a new project for the AMM side of things, AMM Advanced Analytics...

Token Swapping Turbocharger is a way to maximize AMM and token holdings. To take advantage of the Reverse swap calculator and boost your piles, swap some of your assets for other assets (through AMM pool). Then load your r-address into the page and looking at live prices, will tell you if it's profitable to reverse swap to pick up profit. Or you could take advantage of all the benefits of the already amazing AMM and this page, by doing the following… Let's start with 5 XRPL assets (non corelating, no xrp) and let's create an AMM pool for each asset pair. Put the AMM pools in a different account than the one that you will be swapping (in cold storage). Set the fee for the pools to 1% (the max) as you own the pool and since you will be swapping through your pool, you want your pool to make 1% of the value being swapped through it. This increases your pool size slowly over time, as well as what the AMM has managed to accumulate during times of volatility. You want your swapping account transaction history to be centered around swapping, not AMM pools so keep the two accounts separate for best results (less cluttered). Make sure you have some of each asset in your trading account as that's what you'll be swapping through your AMM pools. So, if we have 5 assets and pools for each pair, we'll have 10 AMM pools 1/2, 1/3, 1/4, 1/5, 2/3, 2/4, 2/5, 3/4, 3/5, 4/5 Make small swaps through each pool to ensure they're working and to give the site a starting point to do calculations from. When you log in the site, it loads your transaction history of swaps. It groups all past swaps within swap pairs in chronological order. It starts with your oldest trade (keeping running total) and goes through your swaps in the same order you filled them. It reports your profit/loss on each asset pair, from your first swap until latest swap. It then looks at your latest swap and compares it to the current exchange rate for a reverse swap (AMM pricing). On the right side of the screen, there's an AMM to obtain live quotes and verify the reverse swap suggestion. Select the trade pair you'd like to see the AMM pool for by selecting the trading pair in your list. Once you've made enough swaps in both directions, the page will calculate your Swap Profits. The page auto updates all calculations every 3 minutes. If you're doing sequential swapping, don't look at the page until you're done swapping all the way through the chain. Otherwise, with the site updating, things won't make sense. (might have to do batch swaps in the future)

Special thanks to the XRPL.org, Xaman and most importantly, The Pirate.

causeiam.x


