use anchor_lang::prelude::*;

use anchor_spl::{
    associated_token::AssociatedToken,  token_interface::{Mint, MintTo, Token2022, TokenAccount, mint_to}

};
use crate::{COOLDOWN, CustomError, FREE_TOKENS_PER_EPOCH, FreeMintTracker,HxuiFreeMintCounter};
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
        seeds = [b"free_mint_tracker",owner.key().as_ref()],
        bump = free_mint_tracker.bump
    )]
    pub free_mint_tracker:Account<'info,FreeMintTracker>,

    #[account(
        mut,
        seeds = [b"hxui_free_tokens_counter"],
        bump = free_tokens_counter.bump,
    )]
    pub free_tokens_counter:Account<'info,HxuiFreeMintCounter>,
    pub associated_token_program:Program<'info,AssociatedToken>,
    pub token_program:Program<'info,Token2022>
}

pub fn mint_tokens_for_free(ctx:Context<MintFreeTokens>,amount:u64)->Result<()>{
    let clock = Clock::get()?;
    let current_epoch = clock.epoch;
    let current_unix_timestamp = clock.unix_timestamp;

    let hxui_lite_free_mints_counter = &mut ctx.accounts.free_tokens_counter;
    let is_new_epoch = current_epoch != hxui_lite_free_mints_counter.current_epoch;
    require!(is_new_epoch || hxui_lite_free_mints_counter.remaining_free_mints > 0,CustomError::AllFreeTokensForTheDayMinted);
    
    if is_new_epoch {
        hxui_lite_free_mints_counter.current_epoch =  current_epoch;
        hxui_lite_free_mints_counter.remaining_free_mints = FREE_TOKENS_PER_EPOCH;
    }
    let free_mint_tracker = &mut ctx.accounts.free_mint_tracker;
    require!(!free_mint_tracker.unregistered,CustomError::UnregisteredForFreeTokens);
    require!(current_unix_timestamp >= free_mint_tracker.next_mint_timestamp,CustomError::MintCooldownActive);

    free_mint_tracker.next_mint_timestamp = current_unix_timestamp + COOLDOWN;
    let cpi_context = CpiContext::new(ctx.accounts.token_program.to_account_info(),MintTo{
        mint:ctx.accounts.hxui_lite_mint.to_account_info(),
        to:ctx.accounts.hxui_lite_token_account.to_account_info(),
        authority:ctx.accounts.lite_authority.to_account_info()
    });

    hxui_lite_free_mints_counter.remaining_free_mints -= amount;
    mint_to(cpi_context,amount)
}