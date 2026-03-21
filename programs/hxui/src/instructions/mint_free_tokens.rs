use anchor_lang::prelude::*;

use anchor_spl::{
    associated_token::AssociatedToken,  token_interface::{Mint, MintTo, Token2022, TokenAccount, mint_to}

};
use crate::{  CustomError, FreeMintTracker, HxuiConfig, HxuiFreeMintCounter};
#[derive(Accounts)]

pub struct MintFreeTokens<'info>{
    pub owner:SystemAccount<'info>,

    pub lite_authority:Signer<'info>,
   
    #[account(
        seeds = [b"hxui_config"],
        bump = hxui_config.bump,
    )]
    pub hxui_config: Account<'info,HxuiConfig>,
    
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
        seeds = [b"hxui_free_mint_counter"],
        bump = hxui_free_mint_counter.bump,
    )]
    pub hxui_free_mint_counter:Account<'info,HxuiFreeMintCounter>,
    pub associated_token_program:Program<'info,AssociatedToken>,
    pub token_program:Program<'info,Token2022>
}

pub fn process_mint_free_tokens(ctx:Context<MintFreeTokens>)->Result<()>{
    let clock = Clock::get()?;
    let current_epoch = clock.epoch;
    let current_unix_timestamp = clock.unix_timestamp;

    let hxui_free_mints_counter = &mut ctx.accounts.hxui_free_mint_counter;
    let is_new_epoch = current_epoch != hxui_free_mints_counter.current_epoch;
    require!(is_new_epoch || hxui_free_mints_counter.remaining_free_mints > 0,CustomError::OverallFreeMintLimitExceeded);
    
    let hxui_config  = &mut ctx.accounts.hxui_config;
    if is_new_epoch {
        hxui_free_mints_counter.current_epoch =  current_epoch;
        hxui_free_mints_counter.remaining_free_mints = hxui_config.free_mints_per_epoch;
    }
    let free_mint_tracker = &mut ctx.accounts.free_mint_tracker;
    require!(!free_mint_tracker.unregistered,CustomError::NotRegisteredForFreeTokens);
    require!(current_unix_timestamp >= free_mint_tracker.next_mint_timestamp,CustomError::MintCooldownActive);

    free_mint_tracker.next_mint_timestamp = current_unix_timestamp + hxui_config.free_mint_cool_down;
    let cpi_context = CpiContext::new(ctx.accounts.token_program.to_account_info(),MintTo{
        mint:ctx.accounts.hxui_lite_mint.to_account_info(),
        to:ctx.accounts.hxui_lite_token_account.to_account_info(),
        authority:ctx.accounts.lite_authority.to_account_info()
    });

    hxui_free_mints_counter.remaining_free_mints -= hxui_config.free_tokens_per_mint;
    mint_to(cpi_context,hxui_config.free_tokens_per_mint)
}