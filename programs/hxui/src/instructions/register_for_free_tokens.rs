use anchor_lang::prelude::*;

use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint,Token2022},
};
use crate::{ANCHOR_DISCRIMINATOR,FreeTokenTimestamp};
#[derive(Accounts)]
pub struct RegisterFreeTokens<'info>{
    #[account(mut)]
    pub owner:Signer<'info>,

    // #[account(
    //     init,
    //     payer = owner,
    //     associated_token::authority = owner,
    //     associated_token::mint = hxui_lite_mint,
    //     associated_token::token_program = token_program
    // )]
    // pub hxui_lite_token_account:InterfaceAccount<'info,TokenAccount>,

      #[account(
        seeds = [b"hxui_lite_mint"],
        bump,
        mint::decimals = 0,
        mint::token_program = token_program,
    )]
    pub hxui_lite_mint:InterfaceAccount<'info,Mint>,

    #[account(
        init,
        payer = owner,
        space = ANCHOR_DISCRIMINATOR + FreeTokenTimestamp::INIT_SPACE,
        seeds = [b"minted_timestamp",owner.key().as_ref()],
        bump
    )]
    pub hxui_lite_minted_timestamp:Account<'info,FreeTokenTimestamp>,

    pub system_program:Program<'info,System>,
    pub associated_token_program:Program<'info,AssociatedToken>,
    pub token_program:Program<'info,Token2022>
}

pub fn initialise_hxui_lite_minted_timestamp(ctx:Context<RegisterFreeTokens>)->Result<()>{
    ctx.accounts.hxui_lite_minted_timestamp.bump = ctx.bumps.hxui_lite_minted_timestamp;
    Ok(())
}