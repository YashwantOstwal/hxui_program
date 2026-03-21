use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, Token2022, TokenAccount, mint_to, MintTo}
};

use crate::{HxuiCandidate, CustomError, VoteReceipt, CandidateStatus};

#[derive(Accounts)]
#[instruction(name: String)]
pub struct ClaimBackTokens<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        associated_token::authority = owner,
        associated_token::mint = hxui_mint,
        associated_token::token_program = token_program
    )]
    pub hxui_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"hxui_mint"],
        bump,
        mint::decimals = 0,
        mint::authority = hxui_mint,
        mint::token_program = token_program
    )]
    pub hxui_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [b"hxui_candidate", name.as_bytes()],
        bump = hxui_candidate.bump,
    )]
    pub hxui_candidate: Account<'info, HxuiCandidate>,

    #[account(
        mut,
        seeds = [b"hxui_vault"],
        bump
    )]
    pub hxui_vault: SystemAccount<'info>,

    #[account(
        mut,
        close = hxui_vault,
        seeds = [b"vote_receipt", name.as_bytes(), owner.key().as_ref()],
        bump = vote_receipt.bump,
    )]
    pub vote_receipt: Account<'info, VoteReceipt>,

    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn process_claim_back_tokens(ctx: Context<ClaimBackTokens>) -> Result<()> {
    let hxui_candidate = &mut ctx.accounts.hxui_candidate;

    let is_withdrawn = hxui_candidate.status == CandidateStatus::Withdrawn;
    let is_claimable_winner = hxui_candidate.status == CandidateStatus::ClaimableWinner;
    require!(is_withdrawn || is_claimable_winner, CustomError::IneligibleForTokenClaim);

    let clock = Clock::get()?;
    require!(
        hxui_candidate.claim_deadline != 0 && clock.unix_timestamp <= hxui_candidate.claim_deadline,
        CustomError::OutsideClaimBackWindow
    );

    let vote_receipt = &ctx.accounts.vote_receipt;

    hxui_candidate.receipt_count -= 1;
    let amount = if is_withdrawn {
        vote_receipt.tokens
    } else {
        vote_receipt.tokens.div_ceil(2)
    };

    let seeds: &[&[u8]] = &[b"hxui_mint", &[ctx.bumps.hxui_mint]];
    let signer_seeds: [&[&[u8]]; 1] = [&seeds[..]];

    let cpi_context = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        MintTo {
            mint: ctx.accounts.hxui_mint.to_account_info(),
            to: ctx.accounts.hxui_token_account.to_account_info(),
            authority: ctx.accounts.hxui_mint.to_account_info(),
        },
    )
    .with_signer(&signer_seeds);

    mint_to(cpi_context, amount)
}

