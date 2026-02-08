use anchor_lang::prelude::*;

use anchor_spl::{
    associated_token::AssociatedToken,  token_interface::{Mint, MintTo, Token2022, TokenAccount, mint_to}

};
use crate::{COOLDOWN, CustomError, FREE_TOKENS_PER_EPOCH, FreeTokenTimestamp, FreeTokensCounter};
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

    #[account(
        mut,
        seeds = [b"hxui_free_tokens_counter"],
        bump = free_tokens_counter.bump,
    )]
    pub free_tokens_counter:Account<'info,FreeTokensCounter>,
    pub associated_token_program:Program<'info,AssociatedToken>,
    pub token_program:Program<'info,Token2022>
}

pub fn mint_tokens_for_free(ctx:Context<MintFreeTokens>,amount:u64)->Result<()>{
    let clock = Clock::get()?;
    let current_epoch = clock.epoch;
    let current_unix_timestamp = clock.unix_timestamp;

    let hxui_lite_free_mints_counter = &mut ctx.accounts.free_tokens_counter;
    let is_new_epoch = current_epoch != hxui_lite_free_mints_counter.current_epoch;
    require!(is_new_epoch || hxui_lite_free_mints_counter.remaining_free_tokens > 0,CustomError::AllFreeTokensForTheDayMinted);
    
    if is_new_epoch {
        hxui_lite_free_mints_counter.current_epoch =  current_epoch;
        hxui_lite_free_mints_counter.remaining_free_tokens = FREE_TOKENS_PER_EPOCH;
    }
    let hxui_lite_minted_timestamp = &mut ctx.accounts.hxui_lite_minted_timestamp;
    require!(hxui_lite_minted_timestamp.closable_timestamp == 0,CustomError::UnregisteredFreeTokens);
    require!(current_unix_timestamp >= hxui_lite_minted_timestamp.next_mintable_timestamp,CustomError::RateLimitExceeded);

    hxui_lite_minted_timestamp.next_mintable_timestamp = current_unix_timestamp + COOLDOWN;
    let cpi_context = CpiContext::new(ctx.accounts.token_program.to_account_info(),MintTo{
        mint:ctx.accounts.hxui_lite_mint.to_account_info(),
        to:ctx.accounts.hxui_lite_token_account.to_account_info(),
        authority:ctx.accounts.lite_authority.to_account_info()
    });

    hxui_lite_free_mints_counter.remaining_free_tokens -=1;
    mint_to(cpi_context,amount)
}