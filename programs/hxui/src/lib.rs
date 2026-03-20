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

    pub fn init_dui(ctx:Context<InitDui>,price_per_token:u64,tokens_per_vote:u64,
         free_tokens_per_mint:u64,
     free_mints_per_epoch:u64,
     free_mint_cool_down:i64,)->Result<()>{
        instructions::init_dui::process_init_dui(
            ctx,
            price_per_token,tokens_per_vote,
         free_tokens_per_mint,
     free_mints_per_epoch,
     free_mint_cool_down,
        )
        
    }

    pub fn set_drop_time(ctx:Context<SetDropTime>,poll_deadline:i64)->Result<()>{
        instructions::set_drop_time::process_set_drop_time(ctx, poll_deadline)
    }

pub fn draw_winner<'info>(ctx:Context<'_, '_, 'info, 'info,DrawWinner<'_>>)->Result<()>{
            instructions::draw_winner::process_draw_winner(ctx)
    }

    pub fn register_for_free_tokens(ctx:Context<RegisterForFreeMint>)->Result<()>{
        instructions::register_for_free_mint::process_register_for_free_mint(ctx)
    }  

    pub fn deregister_from_free_mint(ctx:Context<DeregisterFromFreeMint>)->Result<()>{
        instructions::deregister_from_free_mint::process_deregister_from_free_mint(ctx)
    }

pub fn cancel_deregister_from_free_mint(ctx: Context<CancelDeregisterFromFreeMint>) -> Result<()> {
    instructions::cancel_deregister_from_free_mint::process_cancel_deregister_from_free_mint(ctx)
}

pub fn claim_registration_deposit(ctx: Context<ClaimRegistrationDeposit>) -> Result<()> {
    instructions::claim_registration_deposit::process_claim_registration_deposit(ctx)
}

    pub fn mint_free_tokens(ctx:Context<MintFreeTokens>)->Result<()>{
        instructions::mint_free_tokens::process_mint_free_tokens(ctx)
    }
    
    pub fn create_candidate(ctx:Context<CreateCandidate>,name:String,description:String,
    claim_back_offer:bool)->Result<()>{
        instructions::create_candidate::process_create_candidate(ctx,name,description,
        claim_back_offer)
    }
pub fn close_candidate(ctx: Context<CloseCandidate>, _name: String) -> Result<()> {
    instructions::close_candidate::process_close_candidate(ctx)
}
    pub fn open_claim_back_window(
    ctx: Context<OpenClaimBackWindow>,
    _name: String,
    until: i64
) -> Result<()> {
    instructions::open_claim_back_window::process_open_claim_back_window(ctx, _name, until)
}

     pub fn buy_tokens(ctx:Context<BuyTokens>,amount:u64)->Result<()>{
        instructions::buy_tokens::process_buy_tokens(ctx,amount)
    }

    pub fn withdraw_vault_funds(ctx:Context<WithdrawVaultFunds>,amount:Option<u64>)->Result<()>{
        instructions::withdraw_vault_funds::process_withdraw_vault_funds(ctx,amount)
    }
    pub fn vote_with_hxui(ctx:Context<VoteWithHxui>,name:String,votes:u64)->Result<()>{
        instructions::vote_with_hxui::process_vote_with_hxui(ctx,name,votes)
    }

    pub fn vote_with_hxui_lite(ctx:Context<VoteWithHxuiLite>,_name:String,votes:u64)->Result<()>{
        instructions::vote_with_hxui_lite::process_vote_with_hxui_lite(ctx,votes)
    }
    
    pub fn withdraw_candidate(ctx:Context<WithdrawCandidate>,_name:String)->Result<()>{
        instructions::withdraw_candidate::process_withdraw_candidate(ctx)
    }
    
pub fn claim_back_tokens(ctx: Context<ClaimBackTokens>, _name: String) -> Result<()> {
    instructions::claim_back_tokens::process_claim_back_tokens(ctx)
}


pub fn close_vote_receipt(ctx: Context<CloseVoteReceipt>, _name: String) -> Result<()> {
    instructions::close_vote_receipt::process_close_vote_receipt(ctx)
}

    pub fn enable_claim_back_offer(ctx:Context<EnableClaimBackOffer>,_name:String)->Result<()>{
        instructions::enable_claim_back_offer::process_enable_claim_back_offer(ctx)
    }
    pub fn update_config(ctx:Context<UpdateConfig>,price_per_token:Option<u64>,tokens_per_vote:Option<u64>)->Result<()>{
        instructions::update_config::process_update_config(ctx,price_per_token,tokens_per_vote)
    }
    pub fn get_admin_access_for_testing(ctx:Context<GetAdminAccessForTesting>)->Result<()>{
        instructions::get_admin_access_for_testing::process_get_admin_access_for_testing(ctx)
    }

}
