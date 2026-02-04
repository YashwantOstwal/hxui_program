use anchor_lang::{prelude::*, system_program::{Transfer, transfer}};

use anchor_spl::{
    token_interface::{Mint,Token2022},
};
use crate::{ANCHOR_DISCRIMINATOR, Candidate, CandidateVoters, Config, CustomError, Voter};

#[derive(Accounts)]
pub struct FundAdminForCandidate<'info>{
    #[account(mut)]
    pub admin:Signer<'info>,

    #[account(
        has_one = admin,
        seeds = [b"hxui_config"],
        bump = hxui_config.bump
    )]
    pub hxui_config:Account<'info,Config>,

        #[account(
        seeds = [b"hxui_mint"],
        bump,
        mint::decimals = 0,
        mint::authority = hxui_mint,
        mint::token_program = token_program
    )]
    pub hxui_mint:InterfaceAccount<'info,Mint>,

    #[account(
        mut,
        seeds = [b"hxui_vault"],
        bump
    )]
    pub hxui_vault:SystemAccount<'info>,

    pub system_program:Program<'info,System>,
    pub token_program:Program<'info,Token2022>,

}

pub fn transfer_rent_to_admin(ctx:Context<FundAdminForCandidate>)->Result<()>{
    let rent = Rent::get()?;

    let hxui_mint = &ctx.accounts.hxui_mint;
    let hxui_vault =&ctx.accounts.hxui_vault;
    let admin = &ctx.accounts.admin;

    let vault_balance: u64 = hxui_vault.lamports();
    let minimum_vault_balance = rent.minimum_balance(hxui_mint.supply.div_euclid(ctx.accounts.hxui_config.tokens_per_vote)  as usize * Voter::INIT_SPACE);
    
    let candidate_creation_rent =  rent.minimum_balance(ANCHOR_DISCRIMINATOR + Candidate::INIT_SPACE) + rent.minimum_balance(ANCHOR_DISCRIMINATOR + CandidateVoters::INIT_SPACE);

    let seeds: &[&[u8]] = &[b"hxui_vault",&[ctx.bumps.hxui_vault]];
     let signer_seeds = [&seeds[..]];
    require!(vault_balance - minimum_vault_balance >=candidate_creation_rent,CustomError::InsufficientFunds);

    let cpi_context = CpiContext::new(ctx.accounts.system_program.to_account_info(),Transfer{
        from:hxui_vault.to_account_info(),
        to:admin.to_account_info()
    }).with_signer(&signer_seeds);

    transfer(cpi_context,candidate_creation_rent )
}