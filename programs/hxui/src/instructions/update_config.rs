use anchor_lang::prelude::*;

use crate::{HxuiConfig, VoteReceipt,CustomError};

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,

    #[account(mut, has_one = admin,seeds = [b"hxui_config"], bump = hxui_config.bump)]
    pub hxui_config: Account<'info, HxuiConfig>, 

    pub new_admin:Option<Signer<'info>>,   
}

pub fn process_update_config(ctx: Context<UpdateConfig> ,price_per_token: Option<u64>, tokens_per_vote: Option<u64>) -> Result<()> {
    let hxui_config = &mut ctx.accounts.hxui_config;

    if let Some(new_admin) = &ctx.accounts.new_admin {
        hxui_config.admin = new_admin.key();
    }

    if let Some(price_per_token) = price_per_token {
        let rent = Rent::get()?;
         require!(hxui_config.tokens_per_vote * hxui_config.price_per_token >= rent.minimum_balance(VoteReceipt::INIT_SPACE) ,CustomError::TokenPriceNotSufficient);
        hxui_config.price_per_token = price_per_token;
    }

    if let Some(tokens_per_vote) = tokens_per_vote {
        hxui_config.tokens_per_vote = tokens_per_vote;
    }

    Ok(())
}