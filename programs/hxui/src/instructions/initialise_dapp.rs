use anchor_lang::{prelude::*, system_program::{Transfer, transfer}};
use anchor_spl::{
    token_interface::{ Mint,Token2022},
};



use crate::{ANCHOR_DISCRIMINATOR, Config, CustomError, FreeTokensCounter, Voter};
#[derive(Accounts)]
pub struct InitialiseDapp<'info>{
    #[account(mut)]
    pub admin:Signer<'info>,

    pub lite_authority :SystemAccount<'info>,

    #[account(
        mut,
        seeds = [b"hxui_vault"],
        bump
    )]
    pub hxui_vault:SystemAccount<'info>,

    #[account(
        init,
        payer = admin,
        seeds = [b"hxui_mint"],
        bump,
        mint::decimals = 0,
        mint::authority = hxui_mint,
        mint::token_program = token_program
    )]
    pub hxui_mint:InterfaceAccount<'info,Mint>,

    #[account(
        init,
        payer = admin,
        seeds = [b"hxui_config"],
        bump,
        space = ANCHOR_DISCRIMINATOR + Config::INIT_SPACE
    )]
    pub hxui_config: Account<'info,Config>,

    #[account(
        init,
        payer = admin,
        seeds = [b"hxui_lite_mint"],
        bump,
        mint::decimals = 0,
        mint::authority = lite_authority,
        mint::token_program = token_program,
    )]
    pub hxui_lite_mint:InterfaceAccount<'info,Mint>,

    #[account(
        init,
        payer = admin,
        seeds = [b"hxui_free_tokens_counter"],
        bump,
        space = ANCHOR_DISCRIMINATOR + FreeTokensCounter::INIT_SPACE
    )]
    pub free_tokens_counter:Account<'info,FreeTokensCounter>,

    pub system_program:Program<'info,System>,
    pub token_program:Program<'info,Token2022>
}

pub fn initialise_config(ctx:Context<InitialiseDapp>,config:Config)->Result<()>{
    let rent = Rent::get()?;
    require!(config.price_per_token >= rent.minimum_balance(Voter::INIT_SPACE) - rent.minimum_balance(0),CustomError::TokenPriceNotSufficient);
    let config_account = &mut ctx.accounts.hxui_config;
    config_account.set_inner(config);

    let cpi_context = CpiContext::new(ctx.accounts.system_program.to_account_info(),Transfer{
        from:ctx.accounts.admin.to_account_info(),
        to:ctx.accounts.hxui_vault.to_account_info()
    });
    let rent = (Rent::get()?).minimum_balance(0);
    let free_tokens_counter = &mut ctx.accounts.free_tokens_counter;
    free_tokens_counter.bump = ctx.bumps.free_tokens_counter;
    free_tokens_counter.current_epoch = (Clock::get()?).epoch;
    free_tokens_counter.remaining_free_tokens = 100;
    
    transfer(cpi_context, rent)
}
