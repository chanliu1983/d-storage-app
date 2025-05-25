use anchor_lang::prelude::*;
use std::collections::HashMap;

declare_id!("Ed5i4GsQCTU5NLvgieHUWHFAGfBJ61NfktWw271fesEJ");

#[program]
pub mod d_storage_app {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let store = &mut ctx.accounts.store;
        store.owner = ctx.accounts.signer.key();
        msg!("Store initialized by: {}", store.owner);
        Ok(())
    }

    pub fn save(ctx: Context<Save>, key: String, value: String) -> Result<()> {
        let store = &mut ctx.accounts.store;
        require!(store.owner == ctx.accounts.signer.key(), ErrorCode::Unauthorized);
        
        // Convert the stored data to a HashMap
        let mut data: HashMap<String, String> = if store.data.is_empty() {
            HashMap::new()
        } else {
            borsh::BorshDeserialize::try_from_slice(&store.data)?
        };

        // Insert or update the key-value pair
        data.insert(key.clone(), value.clone());
        
        // Serialize back to bytes
        store.data = borsh::BorshSerialize::try_to_vec(&data)?;
        
        msg!("Saved key-value pair: {} = {}", key, value);
        Ok(())
    }

    pub fn query(ctx: Context<Query>, key: String) -> Result<()> {
        let store = &ctx.accounts.store;
        
        // Deserialize the stored data
        let data: HashMap<String, String> = if store.data.is_empty() {
            HashMap::new()
        } else {
            borsh::BorshDeserialize::try_from_slice(&store.data)?
        };

        // Get the value for the key
        if let Some(value) = data.get(&key) {
            msg!("Query result: {} = {}", key, value);
        } else {
            msg!("Key not found: {}", key);
        }
        
        Ok(())
    }

    pub fn list_all(ctx: Context<Query>) -> Result<()> {
        let store = &ctx.accounts.store;
        
        // Deserialize the stored data
        let data: HashMap<String, String> = if store.data.is_empty() {
            HashMap::new()
        } else {
            borsh::BorshDeserialize::try_from_slice(&store.data)?
        };

        // Log all key-value pairs
        msg!("All key-value pairs:");
        for (key, value) in data.iter() {
            msg!("{} = {}", key, value);
        }
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = signer, space = 8 + 32 + 4 + 1000)] // 8 for discriminator, 32 for owner, 4 for vec len, 1000 for data
    pub store: Account<'info, KeyValueStore>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Save<'info> {
    #[account(mut)]
    pub store: Account<'info, KeyValueStore>,
    #[account(mut)]
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct Query<'info> {
    pub store: Account<'info, KeyValueStore>,
}

#[account]
pub struct KeyValueStore {
    pub owner: Pubkey,
    pub data: Vec<u8>, // Serialized HashMap<String, String>
}

#[error_code]
pub enum ErrorCode {
    #[msg("You are not authorized to perform this action")]
    Unauthorized,
}
