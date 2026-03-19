pub mod instructions;
pub mod states;
pub mod constants;
pub mod errors;

use anchor_lang::prelude::*;

pub use instructions::*;
pub use states::*;
pub use constants::*;
pub use errors::*;

declare_id!("6jVyroPEKqPgGv7uaHZpQ3Enqriyy1MXG7pcdLTud3mP");
#[program]
pub mod hxui {

    use super::*;

    pub fn initialise_dapp(ctx:Context<InitialiseDapp>,price_per_token:u64,tokens_per_vote:u64,
         free_tokens_per_mint:u64,
     free_mints_per_epoch:u64,
     free_mint_cool_down:u64,)->Result<()>{
        let config_bump: u8  = ctx.bumps.hxui_config;
        let admin_pubkey: Pubkey = ctx.accounts.admin.key();
        instructions::initialise_dapp::initialise_config(
            ctx,
            HxuiConfig { 
                admin:admin_pubkey,
                price_per_token,
                tokens_per_vote,
                bump:config_bump,
free_tokens_per_mint,
     free_mints_per_epoch,
     free_mint_cool_down,

            },
        )

        
    }

    pub fn create_poll(ctx:Context<CreatePoll>,poll_deadline:i64)->Result<()>{
        instructions::create_poll::create_new_poll(ctx, poll_deadline)
    }

pub fn draw_winner<'info>(ctx:Context<'_, '_, 'info, 'info,PickWinner<'_>>)->Result<()>{
            instructions::pick_winner::pick_winner(ctx)
    }

    pub fn register_for_free_tokens(ctx:Context<RegisterFreeTokens>)->Result<()>{
        instructions::register_for_free_tokens::initialise_free_mint_tracker(ctx)
    }  

    pub fn unregister_for_free_tokens(ctx:Context<UnregisterFreeTokens>)->Result<()>{
        instructions::unregister_for_free_tokens::set_close_time(ctx)
    }

pub fn cancel_unregister_for_free_tokens(ctx: Context<CancelDeregister>) -> Result<()> {
    instructions::cancel_deregister::process_cancel_deregister(ctx)
}

pub fn claim_registration_fees(ctx: Context<ClaimRegistrationDeposit>) -> Result<()> {
    instructions::claim_registration_deposit::process_claim_registration_deposit(ctx)
}

    pub fn mint_free_tokens(ctx:Context<MintFreeTokens>)->Result<()>{
        instructions::mint_free_tokens::mint_tokens_for_free(ctx,1)
    }
    
    pub fn create_candidate(ctx:Context<CreateCandidate>,name:String,description:String,
    claim_back_offer:bool)->Result<()>{
        instructions::create_candidate::initialise_candidate(ctx,name,description,
        claim_back_offer)
    }
pub fn close_candidate(ctx: Context<CloseCandidate>, _name: String) -> Result<()> {
    instructions::close_candidate::process_close_candidate(ctx)
}
    pub fn open_claimable_window(ctx:Context<OpenClaimableWindow>,_name:String,until:i64)->Result<()>{
        instructions::open_claimable_window::set_closable_time(ctx,until)
    }
   

     pub fn buy_paid_tokens(ctx:Context<BuyTokens>,amount:u64)->Result<()>{
        instructions::buy_tokens::process_buy_tokens(ctx,amount)
    }

    pub fn safe_withdraw_from_vault(ctx:Context<SafeWithdrawFromVault>,amount:Option<u64>)->Result<()>{
        instructions::safe_withdraw_from_vault::transfer_to_admin(ctx,amount)
    }
    pub fn vote_candidate(ctx:Context<VoteCandidate>,name:String,votes:u64)->Result<()>{
        instructions::vote_candidate::vote(ctx,name,votes)
    }

    pub fn vote_candidate_with_hxui_lite(ctx:Context<VoteCandidateWithHxuiLite>,_name:String,votes:u64)->Result<()>{
        instructions::vote_candidate_with_hxui_lite::vote_with_hxui_lite(ctx,votes)
    }
    
    pub fn withdraw_candidate(ctx:Context<WithdrawCandidate>,_name:String)->Result<()>{
        instructions::withdraw_candidate::stop_candidate(ctx)
    }
    
pub fn claim_tokens(ctx: Context<ClaimBackTokens>, _name: String) -> Result<()> {
    instructions::claim_back_tokens::process_claim_back_tokens(ctx)
}


pub fn clear_receipt(ctx: Context<CloseVoteReceipt>, _name: String) -> Result<()> {
    instructions::close_vote_receipt::process_close_vote_receipt(ctx)
}

    pub fn set_claim_back_offer(ctx:Context<SetClaimBackOffer>,_name:String)->Result<()>{
        instructions::set_claim_back_offer::set_claimable_if_winner(ctx)
    }
    pub fn update_config(ctx:Context<UpdateConfig>,price_per_token:Option<u64>,tokens_per_vote:Option<u64>)->Result<()>{
        instructions::update_config::process_update_config(ctx,price_per_token,tokens_per_vote)
    }
    pub fn get_admin_access_for_testing(ctx:Context<GetAdminAccessForTesting>)->Result<()>{
        instructions::get_admin_access_for_testing::process_get_admin_access_for_testing(ctx)
    }

}
