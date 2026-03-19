use anchor_lang::prelude::*;
use crate::{HxuiConfig};

#[derive(Accounts)]
pub struct GetAdminAccessForTesting<'info>{
    pub new_admin: Signer<'info>,
    #[account(
        mut,
        seeds = [b"hxui_config"],
        bump = hxui_config.bump,
    )]
    pub hxui_config: Account<'info, HxuiConfig>,
}

pub fn process_get_admin_access_for_testing(ctx:Context<GetAdminAccessForTesting>)->Result<()>{
    let config_account = &mut ctx.accounts.hxui_config;
    config_account.admin = ctx.accounts.new_admin.key();
    Ok(())
}