<script lang="ts">
	import { createClient } from '$lib/supabase';
	import { onMount } from 'svelte';

	type ConfirmationStyle = 'normal' | 'critical';
	type IconType = 'warning' | 'info' | 'trash' | 'send' | 'logout' | 'transfer' | 'shield';

	let {
		show = $bindable(),
		title,
		message,
		details,
		style = 'normal',
		icon,
		confirmText = 'Confirm',
		cancelText = 'Cancel',
		require2FA = false,
		onConfirm,
		onCancel
	}: {
		show: boolean;
		title: string;
		message: string;
		details?: string;
		style?: ConfirmationStyle;
		icon?: IconType;
		confirmText?: string;
		cancelText?: string;
		require2FA?: boolean;
		onConfirm: () => void | Promise<void>;
		onCancel?: () => void;
	} = $props();

	const supabase = createClient();

	let is2FAEnabled = $state(false);
	let checking2FA = $state(false);
	let verificationCode = $state('');
	let isVerifying = $state(false);
	let verificationError = $state('');
	let showVerificationStep = $state(false);
	let factorId = $state('');
	let hasChecked2FA = $state(false);

	// Derived styles based on confirmation type
	const borderColor = $derived(style === 'critical' ? 'border-error' : 'border-primary');
	const iconBgColor = $derived(style === 'critical' ? 'bg-error/10' : 'bg-primary/10');
	const iconColor = $derived(style === 'critical' ? 'text-error' : 'text-primary');
	const titleColor = $derived(style === 'critical' ? 'text-error' : 'text-primary');
	const messageBgColor = $derived(style === 'critical' ? 'bg-error/5' : 'bg-primary/5');
	const messageBorderColor = $derived(style === 'critical' ? 'border-error' : 'border-primary');
	const confirmButtonClass = $derived(
		style === 'critical' ? 'btn-error' : 'btn-primary'
	);

	// Check 2FA status when modal opens
	$effect(() => {
		if (show && require2FA && !hasChecked2FA) {
			check2FAStatus();
		}

		// Reset when modal closes
		if (!show) {
			hasChecked2FA = false;
			is2FAEnabled = false;
			checking2FA = false;
		}
	});

	async function check2FAStatus() {
		console.log('Checking 2FA status...');
		checking2FA = true;
		hasChecked2FA = true;
		try {
			const { data, error: mfaError } = await supabase.auth.mfa.listFactors();
			if (mfaError) throw mfaError;

			const totpFactors = data?.totp || [];
			const verifiedFactor = totpFactors.find((f) => f.status === 'verified');

			if (verifiedFactor) {
				is2FAEnabled = true;
				factorId = verifiedFactor.id;
			}
		} catch (err: any) {
			console.error('Error checking 2FA status:', err);
		} finally {
			checking2FA = false;
		}
	}

	async function handleConfirm() {
		// If 2FA is required and enabled, show verification step
		if (require2FA && is2FAEnabled && !showVerificationStep) {
			showVerificationStep = true;
			return;
		}

		// If verification step is shown, verify the code
		if (showVerificationStep) {
			await verify2FACode();
			return;
		}

		// No 2FA required or not enabled, proceed directly
		await executeConfirm();
	}

	async function verify2FACode() {
		if (!verificationCode.trim()) {
			verificationError = 'Please enter the verification code';
			return;
		}

		isVerifying = true;
		verificationError = '';

		try {
			const challenge = await supabase.auth.mfa.challenge({ factorId });
			if (challenge.error) throw challenge.error;

			const verify = await supabase.auth.mfa.verify({
				factorId,
				challengeId: challenge.data.id,
				code: verificationCode
			});

			if (verify.error) throw verify.error;

			// 2FA verified successfully, proceed with action
			await executeConfirm();
		} catch (err: any) {
			verificationError = err.message || 'Invalid verification code';
		} finally {
			isVerifying = false;
		}
	}

	async function executeConfirm() {
		try {
			await onConfirm();
			closeModal();
		} catch (err: any) {
			verificationError = err.message || 'Action failed';
		}
	}

	function handleCancel() {
		if (onCancel) {
			onCancel();
		}
		closeModal();
	}

	function closeModal() {
		show = false;
		// Reset state
		showVerificationStep = false;
		verificationCode = '';
		verificationError = '';
		isVerifying = false;
	}

	// Get icon based on icon prop or default by style
	function getIcon() {
		// If custom icon is specified, use it
		const iconType = icon || (style === 'critical' ? 'warning' : 'info');

		const icons: Record<IconType, string> = {
			warning: `
				<svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
					<line x1="12" y1="9" x2="12" y2="13"></line>
					<line x1="12" y1="17" x2="12.01" y2="17"></line>
				</svg>
			`,
			info: `
				<svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="10"></circle>
					<line x1="12" y1="8" x2="12" y2="12"></line>
					<line x1="12" y1="16" x2="12.01" y2="16"></line>
				</svg>
			`,
			trash: `
				<svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="3 6 5 6 21 6"></polyline>
					<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
					<line x1="10" y1="11" x2="10" y2="17"></line>
					<line x1="14" y1="11" x2="14" y2="17"></line>
				</svg>
			`,
			send: `
				<svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="22" y1="2" x2="11" y2="13"></line>
					<polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
				</svg>
			`,
			logout: `
				<svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
					<polyline points="16 17 21 12 16 7"></polyline>
					<line x1="21" y1="12" x2="9" y2="12"></line>
				</svg>
			`,
			transfer: `
				<svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="17 1 21 5 17 9"></polyline>
					<path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
					<polyline points="7 23 3 19 7 15"></polyline>
					<path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
				</svg>
			`,
			shield: `
				<svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
				</svg>
			`
		};

		return icons[iconType];
	}
</script>

{#if show}
	<div class="modal modal-open">
		<div class="modal-box border-2 {borderColor}">
			<!-- Header with icon -->
			<div class="flex items-center gap-3 mb-4">
				<div class="{iconBgColor} p-3 rounded-full">
					<div class={iconColor}>
						{@html getIcon()}
					</div>
				</div>
				<div>
					<h3 class="font-bold text-xl {titleColor}">{title}</h3>
					{#if style === 'critical'}
						<p class="text-sm text-base-content/70">This action cannot be undone</p>
					{/if}
				</div>
			</div>

			{#if !showVerificationStep}
				<!-- Warning/Info message -->
				<div class="{messageBgColor} border-l-4 {messageBorderColor} p-4 mb-4">
					<p class="text-base-content mb-2">
						{@html message}
					</p>
					{#if details}
						<p class="text-sm text-base-content/70">
							{details}
						</p>
					{/if}
				</div>

				{#if require2FA && is2FAEnabled}
					<div class="alert alert-info mb-4">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="w-5 h-5"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
							<path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
						</svg>
						<span class="text-sm">This action requires 2FA verification</span>
					</div>
				{/if}
			{:else}
				<!-- 2FA Verification Step -->
				<div class="space-y-4">
					<div class="alert alert-info">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="w-5 h-5"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
							<path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
						</svg>
						<span class="text-sm">Enter your 2FA code from your authenticator app</span>
					</div>

					<div class="form-control">
						<label for="verificationCode" class="label">
							<span class="label-text">Verification Code</span>
						</label>
						<input
							id="verificationCode"
							type="text"
							inputmode="numeric"
							class="input input-bordered w-full text-center text-2xl tracking-widest"
							bind:value={verificationCode}
							placeholder="000000"
							maxlength="6"
							pattern="[0-9]*"
							disabled={isVerifying}
						/>
						{#if verificationError}
							<label class="label" for="verificationCode">
								<span class="label-text-alt text-error">{verificationError}</span>
							</label>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Actions -->
			<div class="modal-action">
				{#if showVerificationStep}
					<button
						type="button"
						class="btn btn-ghost"
						onclick={() => (showVerificationStep = false)}
						disabled={isVerifying}
					>
						Back
					</button>
				{:else}
					<button type="button" class="btn btn-ghost" onclick={handleCancel} disabled={isVerifying}>
						{cancelText}
					</button>
				{/if}

				<button
					type="button"
					class="btn {confirmButtonClass} gap-2"
					onclick={handleConfirm}
					disabled={isVerifying || checking2FA}
				>
					{#if isVerifying || checking2FA}
						<span class="loading loading-spinner loading-sm"></span>
					{:else if showVerificationStep}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="w-5 h-5"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<polyline points="20 6 9 17 4 12"></polyline>
						</svg>
					{:else if style === 'critical'}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="w-5 h-5"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<polyline points="3 6 5 6 21 6"></polyline>
							<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
							></path>
						</svg>
					{/if}
					{showVerificationStep ? 'Verify & Confirm' : confirmText}
				</button>
			</div>
		</div>
		<div class="modal-backdrop" onclick={handleCancel}></div>
	</div>
{/if}
