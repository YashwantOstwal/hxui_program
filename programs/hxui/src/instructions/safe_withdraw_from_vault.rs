use anchor_lang::{prelude::*, system_program::{Transfer, transfer}};
use anchor_spl::{
    token_interface::{ Mint,Token2022},
};



use crate::{Config,Voter,CustomError};
#[derive(Accounts)]
pub struct SafeWithdrawFromVault<'info>{
    #[account(mut)]
    pub admin:Signer<'info>,

    #[account(
        has_one = admin @ CustomError::OnlyAdminAccess,
        seeds = [b"hxui_config"],
        bump = hxui_config.bump,
    )]
    pub hxui_config: Account<'info,Config>,
    #[account(
        mut,
        seeds = [b"hxui_vault"],
        bump
    )]
    pub hxui_vault:SystemAccount<'info>,

    #[account(
        seeds = [b"hxui_mint"],
        bump,
        mint::decimals = 0,
        mint::authority = hxui_mint,
        mint::token_program = token_program
    )]
    pub hxui_mint:InterfaceAccount<'info,Mint>,

    pub system_program:Program<'info,System>,
    pub token_program:Program<'info,Token2022>
}

pub fn transfer_to_admin(ctx:Context<SafeWithdrawFromVault>,amount:Option<u64>)->Result<()>{
    let rent = Rent::get()?;

        let hxui_mint = &ctx.accounts.hxui_mint;
        let vault_balance: u64 =  ctx.accounts.hxui_vault.lamports();
        
        let seeds:&[&[u8]] = &[b"hxui_vault",&[ctx.bumps.hxui_vault]];
        let signer_seeds: [&[&[u8]]; 1] = [&seeds[..]];
        let minimum_vault_balance_required = rent.minimum_balance(hxui_mint.supply.div_euclid(ctx.accounts.hxui_config.tokens_per_vote)  as usize * Voter::INIT_SPACE);
        let cpi_context = CpiContext::new(ctx.accounts.system_program.to_account_info(),Transfer{
            from:ctx.accounts.hxui_vault.to_account_info(),
            to:ctx.accounts.admin.to_account_info()
        }).with_signer(&signer_seeds);
        match amount{
        Some(amount)=>{
            require!(amount<=vault_balance-minimum_vault_balance_required,CustomError::InsufficientFunds);
            transfer(cpi_context, amount)
        },
        None=>{
            transfer(cpi_context,vault_balance-minimum_vault_balance_required)
        }
        }
}