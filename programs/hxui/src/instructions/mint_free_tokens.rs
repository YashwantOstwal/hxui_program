use anchor_lang::prelude::*;

use anchor_spl::{
    associated_token::AssociatedToken,  token_interface::{Mint, MintTo, Token2022, TokenAccount, mint_to}

};
use crate::{FreeTokenTimestamp,CustomError};
#[derive(Accounts)]

pub struct MintFreeTokens<'info>{
    pub owner:SystemAccount<'info>,

    pub lite_authority:Signer<'info>,
     #[account(
        mut,
        associated_token::authority = owner,
        associated_token::mint = hxui_lite_mint,
        associated_token::token_program = token_program
    )]
    pub hxui_lite_token_account:InterfaceAccount<'info,TokenAccount>,

    #[account(
        mut,
        seeds = [b"hxui_lite_mint"],
        bump,
        mint::decimals = 0,
        mint::authority = lite_authority,
        mint::token_program = token_program,
    )]
    pub hxui_lite_mint:InterfaceAccount<'info,Mint>,

     #[account(
        mut,
        seeds = [b"minted_timestamp",owner.key().as_ref()],
        bump = hxui_lite_minted_timestamp.bump
    )]
    pub hxui_lite_minted_timestamp:Account<'info,FreeTokenTimestamp>,

    pub associated_token_program:Program<'info,AssociatedToken>,
    pub token_program:Program<'info,Token2022>
}

pub fn mint_tokens(ctx:Context<MintFreeTokens>,amount:u64)->Result<()>{
    let clock = Clock::get()?;
    let hxui_lite_minted_timestamp = &mut ctx.accounts.hxui_lite_minted_timestamp;
    require!(hxui_lite_minted_timestamp.last_minted_timestamp == 0 || (clock.unix_timestamp - hxui_lite_minted_timestamp.last_minted_timestamp >= 5),CustomError::RateLimitExceeded);

    hxui_lite_minted_timestamp.last_minted_timestamp = clock.unix_timestamp;
    //mint the tokens, lite_authority is a signer.
    let cpi_context = CpiContext::new(ctx.accounts.token_program.to_account_info(),MintTo{
        mint:ctx.accounts.hxui_lite_mint.to_account_info(),
        to:ctx.accounts.hxui_lite_token_account.to_account_info(),
        authority:ctx.accounts.lite_authority.to_account_info()
    });

    mint_to(cpi_context,amount)
}