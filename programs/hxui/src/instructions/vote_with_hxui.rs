use anchor_lang::prelude::*;
use anchor_lang::system_program::{CreateAccount, create_account};

use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint,TokenAccount,Token2022,Burn,burn},
};
use crate::{HxuiCandidate, HxuiConfig, CustomError,ANCHOR_DISCRIMINATOR,VoteReceipt, CandidateStatus};
#[derive(Accounts)]
#[instruction(name:String)]
pub struct VoteWithHxui<'info>{
    pub owner:Signer<'info>,

    #[account(
        mut,
        associated_token::authority = owner,
        associated_token::mint = hxui_mint,
        associated_token::token_program = token_program
    )]
    pub hxui_token_account:InterfaceAccount<'info,TokenAccount>,

     #[account(
        mut,
        seeds = [b"hxui_mint"],
        bump,
        mint::decimals = 0,
        mint::authority = hxui_mint,
        mint::token_program = token_program
    )]
    pub hxui_mint:InterfaceAccount<'info,Mint>,

    #[account(
        mut,
        seeds = [b"hxui_candidate",name.as_bytes()],
        bump = hxui_candidate.bump,
        constraint = hxui_candidate.status == CandidateStatus::Active @ CustomError::InactiveCandidateVoted,
    )]
    pub hxui_candidate:Account<'info,HxuiCandidate>,

    
    /// CHECK: This account can either be VoteReceipt owned by the current program or be uninitialised (owned by System program). 
    #[account(
        mut,
        seeds = [b"vote_receipt",name.as_bytes(),owner.key().as_ref()],
        bump,
    )]
    pub vote_receipt:UncheckedAccount<'info>,


    #[account(
        mut,
        seeds = [b"hxui_vault"],
        bump
    )]
    pub hxui_vault:SystemAccount<'info>,

    #[account(
        seeds = [b"hxui_config"],
        bump = hxui_config.bump,
    )]
    pub hxui_config: Account<'info,HxuiConfig>,

    pub system_program:Program<'info,System>,
    pub associated_token_program:Program<'info,AssociatedToken>,
    pub token_program:Program<'info,Token2022>,
}

pub fn process_vote_with_hxui(ctx:Context<VoteWithHxui>,name:String,votes:u64)->Result<()>{
    require!(votes > 0,CustomError::ZeroVotesProvided);
    let hxui_candidate = &mut ctx.accounts.hxui_candidate;
    let vote_receipt = &mut ctx.accounts.vote_receipt;
    let hxui_config = & ctx.accounts.hxui_config;
    let hxui_vault = &mut ctx.accounts.hxui_vault;

    let tokens_spent = votes * hxui_config.tokens_per_vote;
    if vote_receipt.owner == ctx.program_id {

        let mut data = vote_receipt.try_borrow_mut_data()?;
        let mut vote_receipt_data: VoteReceipt = AccountDeserialize::try_deserialize(&mut &data[..])?;
            
        vote_receipt_data.tokens += tokens_spent;  
        vote_receipt_data.try_serialize(&mut &mut data[..])?;
    }
    else {
        hxui_candidate.receipt_count +=1;

        let owner_pubkey = &ctx.accounts.owner.key();

        let receipt_seeds:&[&[u8]] = &[b"vote_receipt",name.as_bytes(),owner_pubkey.as_ref(),&[ctx.bumps.vote_receipt]];
        let vault_seeds:&[&[u8]] = &[b"hxui_vault",&[ctx.bumps.hxui_vault]];

        let pda_signer_seeds = [&receipt_seeds[..],&vault_seeds[..]];
        let system_program = &mut ctx.accounts.system_program;
        let cpi_context = CpiContext::new(system_program.to_account_info(),CreateAccount {
            from:hxui_vault.to_account_info(),
            to:vote_receipt.to_account_info()
        }).with_signer(&pda_signer_seeds);


        let space = ANCHOR_DISCRIMINATOR + VoteReceipt::INIT_SPACE;
        let rent = (Rent::get()?).minimum_balance(space);
        create_account(cpi_context, rent, space as u64, &ctx.program_id)?;

        let mut data = vote_receipt.try_borrow_mut_data()?;
        let state = VoteReceipt {
            id:hxui_candidate.id,tokens:tokens_spent,bump:ctx.bumps.vote_receipt
        };

        let discriminator: &[u8] = VoteReceipt::DISCRIMINATOR;
        data[..8].copy_from_slice(&discriminator);
        state.serialize(&mut &mut data[8..])?;
    }
    hxui_candidate.vote_count += votes;
    let cpi_context = CpiContext::new(ctx.accounts.token_program.to_account_info(),Burn{
        mint:ctx.accounts.hxui_mint.to_account_info(),
        from:ctx.accounts.hxui_token_account.to_account_info(),
        authority:ctx.accounts.owner.to_account_info()
    });

    burn(cpi_context,tokens_spent )
    }
