use anchor_lang::prelude::*;

use anchor_spl::{
    token_interface::{Mint,Token2022},
};
use crate::{ANCHOR_DISCRIMINATOR,FreeTokenTimestamp};
#[derive(Accounts)]
pub struct RegisterFreeTokens<'info>{
    #[account(mut)]
    pub owner:Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = ANCHOR_DISCRIMINATOR + FreeTokenTimestamp::INIT_SPACE,
        seeds = [b"minted_timestamp",owner.key().as_ref()],
        bump
    )]
    pub hxui_lite_minted_timestamp:Account<'info,FreeTokenTimestamp>,

    pub system_program:Program<'info,System>,
}

pub fn initialise_hxui_lite_minted_timestamp(ctx:Context<RegisterFreeTokens>)->Result<()>{
    ctx.accounts.hxui_lite_minted_timestamp.bump = ctx.bumps.hxui_lite_minted_timestamp;
    Ok(())
}