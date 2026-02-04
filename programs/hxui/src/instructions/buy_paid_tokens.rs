use anchor_lang::{prelude::*,system_program::{transfer,Transfer}};
use anchor_spl::{
    associated_token::{AssociatedToken},
    token_interface::{Mint,Token2022,TokenAccount,mint_to,MintTo}
};

use crate::{Config};
#[derive(Accounts)]
pub struct BuyPaidTokens<'info>{
    #[account(mut)]
    pub owner:Signer<'info>,

    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = hxui_mint,
        associated_token::authority = owner,
        associated_token::token_program = token_program
    )]
     pub hxui_token_account:InterfaceAccount<'info,TokenAccount>,

     #[account(
        mut,
        seeds = [b"hxui_mint"],
        bump,
        mint::decimals = 0,
        mint::authority = hxui_mint,
        mint::token_program = token_program
    )]
    pub hxui_mint:InterfaceAccount<'info,Mint>,

    #[account(
        seeds = [b"hxui_config"],
        bump = hxui_config.bump
    )]
    pub hxui_config:Account<'info,Config>,

    #[account(
        mut,
        seeds = [b"hxui_vault"],
        bump
    )]
    pub hxui_vault:SystemAccount<'info>,

    pub associated_token_program:Program<'info,AssociatedToken>,
    pub system_program :Program<'info,System>,
    pub token_program:Program<'info,Token2022>
}


pub fn payment(ctx:&Context<BuyPaidTokens>,amount:&u64)->Result<()>{

    let cpi_context = CpiContext::new(ctx.accounts.system_program.to_account_info(),
Transfer{
    from:ctx.accounts.owner.to_account_info(),
    to:ctx.accounts.hxui_vault.to_account_info()
});

    transfer(cpi_context,ctx.accounts.hxui_config.price_per_token * amount)
}


pub fn mint_tokens(ctx:Context<BuyPaidTokens>,amount:u64)->Result<()>{
    let seeds: &[&[u8]] = &[b"hxui_mint",&[ctx.bumps.hxui_mint]];
    let signer_seeds: [&[&[u8]]; 1] = [&seeds[..]];
    let cpi_context = CpiContext::new(ctx.accounts.token_program.to_account_info(),
MintTo{
    mint:ctx.accounts.hxui_mint.to_account_info(),
    to:ctx.accounts.hxui_token_account.to_account_info(),
    authority:ctx.accounts.hxui_mint.to_account_info()
}).with_signer(&signer_seeds);

mint_to(cpi_context, amount)
}