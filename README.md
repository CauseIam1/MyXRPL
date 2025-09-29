# MyXRPL
AMM Turbocharger is a way to maximize AMM and asset holdings. On top of the amazing AMM itself. 
Here's how it works... 
Let's start with 5 XRPL assets (non corelating, no xrp) and let's create an AMM pool for each asset pair. 
Put the AMM pools in a different account than the one that you’ll be swapping (in cold storage).
Set the fee for the pools to 1% (the max) as you own the pool and since you'll be swapping through your pool, you want your pool to make 1% of the value being swapped through it. 
This increases your pool size slowly over time, as well as what the AMM has managed to accumulate during times of volatility. 
You want your swapping account’s transaction history to be centered around swapping, not AMM pools so keep the two accounts separate for best results (less cluttered).
Make sure you have some of each asset in your trading account as that's what you'll be swapping through your AMM pools.
So, if we have 5 assets and pools for each pair, we'll have 10 AMM pools 1/2, 1/3, 1/4, 1/5, 2/3, 2/4, 2/5, 3/4, 3/5, 4/5 
Make small swaps through each pool to ensure they're working and to give the site a starting point to do calculations from. 
When you log in the site, it loads your transaction history of swaps (currently set to 1000 payment transactions).
It groups all past swaps within swap pairs in chronological order. 
It starts with your oldest trade (keeping running total) and goes through your swaps in the same order you filled them.
It reports your profit/loss on each asset pair, from your first swap until latest swap. 
It then looks at the exchange rate of your latest swap and compares it to the current exchange rate for the pair (based on dex order pricing) 
After it's calculated all of the above, it puts the most profitable reverse swap at the top of the list where it shows how much you could receive if you made a reverse swap of your latest swap. 
It also displays the breakdown and analysis of your previous swaps for this pair so you can see how you're doing with this trading pair. 
On the right side of the screen, there's an AMM to obtain live quotes and verify the reverse swap suggestion. 
The AMM can only focus on 1 trade pair at a time. 
Select the trade pair you'd like to see the AMM pool for by selecting the trading pair in your list. 
The AMM will then move from the trade it was focused on and move to the trade you selected. 
You can then enter your latest swap value into the AMM and fetch a live quote to verify what would happen if you did the reverse swap.

Once tested for a period of time and verified of all the features of the site are working properly the following will be phased in.
Migration to React
Login integration using Xaman (Xumm SDK)
AMM swap functionality added to the AMM pool
Fire up an XRPL Node so the site can retrieve requests from my Node
Switch from search of 1000 transactions to search ledger index 87000589 for accurate results back to the time when the AMM amendment was invoked.
If all is functioning properly at this time the site should show you the following.
All token swaps with profit/loss of each asset pair in chronological order since the beginning of the AMM pool inception (Mar, 2024)
Assess all latest swaps and compare the exchange rate against the current exchange rate
List the asset pairs in order from most potential profit to least potential profit
AMM will be focused on the pair with the most potential profit to start with so it’s ready to swap

Stage 2 will come after all of the above has been implemented.
Additional option of giving the Turbocharger a shot of Nitrous. 
It involves multiple sequential swaps. But I'll leave it there for now...

Progress can be tracked by visiting…
myxrpl.x
I update this site with my latest working file, about once a week to see how it looks on my cell.
This site is being created for the personal, family and friend use with no affilation. 

