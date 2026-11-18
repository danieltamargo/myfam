<script lang="ts">
	import { getLocale } from '$paraglide/runtime';
	import * as messages from '$paraglide/messages';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	import type { SubmitFunction } from '@sveltejs/kit';

	let { data, form }: PageProps = $props();
	let showRecipeForm = $state(false);
	let showMealForm = $state(false);
	let actionFeedback = $state<{ familyId: string; message: string } | null>(null);
	const retainedMessage = $derived(
		actionFeedback?.familyId === data.familyId ? actionFeedback.message : ''
	);
	const rememberActionResult: SubmitFunction = () => {
		const familyId = data.familyId;
		actionFeedback = null;
		return async ({ result, update }) => {
			await update();
			if (result.type === 'success' && typeof result.data?.message === 'string')
				actionFeedback = { familyId, message: result.data.message };
		};
	};
	const ingredientExample = '2 | kg | Patatas\n1 | l | Caldo\nSal';

	const mealTypes = [
		{ id: 'breakfast', label: 'Desayuno' },
		{ id: 'lunch', label: 'Comida' },
		{ id: 'dinner', label: 'Cena' },
		{ id: 'snack', label: 'Tentempié' }
	] as const;

	function formatDay(date: string): { weekday: string; day: string } {
		const value = new Date(`${date}T00:00:00Z`);
		return {
			weekday: new Intl.DateTimeFormat(getLocale() === 'en' ? 'en-GB' : 'es-ES', {
				weekday: 'short',
				timeZone: 'UTC'
			}).format(value),
			day: new Intl.DateTimeFormat(getLocale() === 'en' ? 'en-GB' : 'es-ES', {
				day: 'numeric',
				month: 'short',
				timeZone: 'UTC'
			}).format(value)
		};
	}

	function entriesFor(date: string) {
		return data.entries.filter((entry) => entry.planned_on === date);
	}

	function mealLabel(type: string): string {
		return mealTypes.find((meal) => meal.id === type)?.label ?? type;
	}

	function quantity(value: number | null): string {
		return value === null
			? ''
			: new Intl.NumberFormat(getLocale() === 'en' ? 'en-GB' : 'es-ES', {
					maximumFractionDigits: 3
				}).format(value);
	}

	function shiftWeek(date: string, days: number): string {
		return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000)
			.toISOString()
			.slice(0, 10);
	}
</script>

<svelte:head>
	<title>{messages['ui.meals_myfamily']()}</title>
	<meta
		name="description"
		content="Planifica las comidas semanales y prepara la compra familiar."
	/>
</svelte:head>

<div class="mx-auto w-full max-w-7xl space-y-7 px-3 py-4 sm:px-5 sm:py-7">
	<header class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
		<div class="max-w-2xl">
			<p class="mb-1 text-sm font-semibold tracking-wide text-primary uppercase">
				{messages['screen.this_week']()}
			</p>
			<h1 class="text-3xl font-bold tracking-tight sm:text-4xl">{messages['ui.meal_plan']()}</h1>
			<p class="mt-2 text-sm text-base-content/65 sm:text-base">
				{messages['screen.decide_what_to_cook_and_send_the_ingredients_to_your_shopping_list']()}
			</p>
		</div>
		<div class="grid grid-cols-2 gap-2 sm:flex">
			<button class="btn" type="button" onclick={() => (showRecipeForm = !showRecipeForm)}>
				{showRecipeForm ? 'Cerrar receta' : '+ Nueva receta'}
			</button>
			<button
				class="btn btn-primary"
				type="button"
				onclick={() => (showMealForm = !showMealForm)}
				disabled={data.recipes.length === 0}
			>
				{showMealForm ? 'Cerrar plan' : '+ Planificar'}
			</button>
		</div>
	</header>

	{#if form?.error}
		<div role="alert" class="alert alert-soft alert-error"><span>{form.error}</span></div>
	{:else if form?.message || retainedMessage}
		<div role="status" class="alert alert-soft alert-success">
			<span>{form?.message || retainedMessage}</span>
		</div>
	{/if}

	{#if showRecipeForm}
		<section
			id="new-recipe"
			class="rounded-box border border-base-300 bg-base-100 p-4 sm:p-6"
			aria-labelledby="new-recipe-title"
		>
			<div class="mb-5">
				<h2 id="new-recipe-title" class="text-xl font-bold">{messages['ui.new_recipe']()}</h2>
				<p class="text-sm text-base-content/55">
					{messages['screen.save_a_recipe_the_whole_family_can_use']()}
				</p>
			</div>
			<form
				method="POST"
				action="?/createRecipe"
				use:enhance={rememberActionResult}
				class="space-y-5"
			>
				<div class="grid gap-4 md:grid-cols-2">
					<label class="form-control md:col-span-2">
						<span class="label-text mb-1 font-medium">{messages['ui.name']()}</span>
						<input class="input w-full" name="title" maxlength="160" required />
					</label>
					<label class="form-control">
						<span class="label-text mb-1 font-medium">{messages['ui.description']()}</span>
						<textarea class="textarea min-h-28 w-full" name="description" maxlength="2000"
						></textarea>
					</label>
					<label class="form-control">
						<span class="label-text mb-1 font-medium">{messages['screen.method']()}</span>
						<textarea class="textarea min-h-28 w-full" name="instructions" maxlength="10000"
						></textarea>
					</label>
					<label class="form-control">
						<span class="label-text mb-1 font-medium">{messages['details.servings']()}</span>
						<input
							class="input w-full"
							name="servings"
							type="number"
							min="1"
							max="50"
							value="4"
							required
						/>
					</label>
					<label class="form-control md:col-span-2">
						<span class="label-text mb-1 font-medium">{messages['screen.ingredients']()}</span>
						<textarea
							class="textarea min-h-36 w-full font-mono text-sm"
							name="ingredients"
							placeholder={ingredientExample}
							required
						></textarea>
						<span class="mt-1 text-xs text-base-content/50"
							>Una línea por ingrediente: cantidad | unidad | nombre. También puedes escribir solo
							el nombre.</span
						>
					</label>
				</div>
				<div class="flex justify-end">
					<button class="btn w-full btn-primary sm:w-auto" type="submit"
						>{messages['ui.save_recipe']()}</button
					>
				</div>
			</form>
		</section>
	{/if}

	{#if showMealForm}
		<section
			id="schedule-meal"
			class="rounded-box border border-primary/25 bg-primary/5 p-4 sm:p-6"
			aria-labelledby="schedule-title"
		>
			<h2 id="schedule-title" class="text-xl font-bold">{messages['ui.add_to_plan']()}</h2>
			<form
				method="POST"
				action="?/scheduleMeal"
				use:enhance={rememberActionResult}
				class="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5"
			>
				<label class="form-control xl:col-span-2">
					<span class="label-text mb-1 font-medium">{messages['details.recipe']()}</span>
					<select class="select w-full" name="recipe_id" required>
						{#each data.recipes as recipe (recipe.id)}<option value={recipe.id}
								>{recipe.title}</option
							>{/each}
					</select>
				</label>
				<label class="form-control">
					<span class="label-text mb-1 font-medium">Día</span>
					<input
						class="input w-full"
						name="planned_on"
						type="date"
						value={data.weekStart}
						required
					/>
				</label>
				<label class="form-control">
					<span class="label-text mb-1 font-medium">{messages['details.meal']()}</span>
					<select class="select w-full" name="meal_type">
						{#each mealTypes as meal (meal.id)}<option value={meal.id}>{meal.label}</option>{/each}
					</select>
				</label>
				<label class="form-control md:col-span-2 xl:col-span-4">
					<span class="label-text mb-1 font-medium">{messages['screen.optional_note']()}</span>
					<input
						class="input w-full"
						name="notes"
						maxlength="1000"
						placeholder="Dejar preparado por la mañana"
					/>
				</label>
				<div class="flex items-end">
					<button class="btn w-full btn-primary" type="submit"
						>{messages['ui.save_to_plan']()}</button
					>
				</div>
			</form>
		</section>
	{/if}

	<section aria-labelledby="week-title" class="space-y-4">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h2 id="week-title" class="text-xl font-bold">
					{messages['details.week_of']()}
					{formatDay(data.weekStart).day}
				</h2>
				<p class="text-sm text-base-content/50">
					{data.entries.length}
					{messages['details.meals_planned']()}
				</p>
			</div>
			<div class="join">
				<a
					class="btn join-item btn-sm"
					aria-label="Semana anterior"
					href={resolve(`/family/${data.familyId}/meals?week=${shiftWeek(data.weekStart, -7)}`)}
					>←</a
				>
				<a class="btn join-item btn-sm" href={resolve(`/family/${data.familyId}/meals`)}
					>{messages['ui.today']()}</a
				>
				<a
					class="btn join-item btn-sm"
					aria-label="Semana siguiente"
					href={resolve(`/family/${data.familyId}/meals?week=${shiftWeek(data.weekStart, 7)}`)}>→</a
				>
			</div>
		</div>

		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
			{#each data.days as day (day)}
				{@const dayEntries = entriesFor(day)}
				<article class="min-h-48 rounded-box border border-base-300 bg-base-100 p-3">
					<header class="mb-3 border-b border-base-200 pb-2">
						<p class="text-xs font-bold tracking-wide text-primary uppercase">
							{formatDay(day).weekday}
						</p>
						<p class="font-semibold">{formatDay(day).day}</p>
					</header>
					{#if dayEntries.length === 0}
						<p class="py-5 text-center text-sm text-base-content/40">
							{messages['details.nothing_planned']()}
						</p>
					{:else}
						<div class="space-y-2">
							{#each dayEntries as entry (entry.id)}
								<div class="rounded-field bg-base-200 p-2.5">
									<p class="text-xs font-semibold text-base-content/50">
										{mealLabel(entry.mealType)}
									</p>
									<p class="mt-0.5 text-sm font-semibold">{entry.recipeTitle}</p>
									{#if entry.notes}<p class="mt-1 text-xs text-base-content/60">
											{entry.notes}
										</p>{/if}
									<form
										method="POST"
										action="?/removeMeal"
										use:enhance={rememberActionResult}
										class="mt-1 text-right"
									>
										<input type="hidden" name="entry_id" value={entry.id} />
										<button class="btn btn-ghost btn-xs" type="submit"
											>{messages['ui.remove']()}</button
										>
									</form>
								</div>
							{/each}
						</div>
					{/if}
				</article>
			{/each}
		</div>
	</section>

	<section aria-labelledby="recipes-title" class="space-y-4">
		<div>
			<p class="text-sm font-semibold text-secondary">{messages['screen.make_it_again']()}</p>
			<h2 id="recipes-title" class="text-2xl font-bold">{messages['ui.family_recipe_book']()}</h2>
		</div>
		{#if data.recipes.length === 0}
			<div
				class="rounded-box border border-dashed border-base-300 bg-base-100 px-5 py-12 text-center"
			>
				<p class="text-3xl" aria-hidden="true">🍲</p>
				<h3 class="mt-2 font-semibold">{messages['ui.no_recipes_yet']()}</h3>
				<p class="mt-1 text-sm text-base-content/55">
					{messages['details.save_your_first_recipe_to_start_planning_the_week']()}
				</p>
			</div>
		{:else}
			<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{#each data.recipes as recipe (recipe.id)}
					<article class="card bg-base-100 card-border">
						<div class="card-body gap-4">
							<div>
								<div class="flex items-start justify-between gap-3">
									<h3 class="card-title text-lg">{recipe.title}</h3>
									<span class="badge badge-ghost whitespace-nowrap"
										>{recipe.servings} {messages['details.servings_74']()}</span
									>
								</div>
								{#if recipe.description}<p class="mt-1 text-sm text-base-content/60">
										{recipe.description}
									</p>{/if}
							</div>
							<div>
								<p class="mb-2 text-xs font-bold tracking-wide text-base-content/45 uppercase">
									{messages['screen.ingredients']()}
								</p>
								<ul class="space-y-1 text-sm">
									{#each recipe.ingredients as ingredient (ingredient.id)}
										<li class="flex gap-2">
											<span class="text-primary">•</span><span
												>{quantity(ingredient.quantity)}
												{ingredient.unit ?? ''}
												{ingredient.name}</span
											>
										</li>
									{/each}
								</ul>
							</div>
							{#if recipe.instructions}<p class="text-sm whitespace-pre-line text-base-content/65">
									{recipe.instructions}
								</p>{/if}
							{#if data.lists.length > 0}
								<form
									method="POST"
									action="?/copyIngredients"
									use:enhance={rememberActionResult}
									class="mt-auto flex flex-col gap-2 sm:flex-row"
								>
									<input type="hidden" name="recipe_id" value={recipe.id} />
									<label class="sr-only" for={`list-${recipe.id}`}
										>{messages['ui.destination_list']()}</label
									>
									<select id={`list-${recipe.id}`} class="select min-w-0 flex-1" name="list_id">
										{#each data.lists as list (list.id)}<option value={list.id}>{list.title}</option
											>{/each}
									</select>
									<button class="btn btn-secondary" type="submit"
										>{messages['ui.send_to_list']()}</button
									>
								</form>
							{:else}
								<a
									class="btn mt-auto btn-ghost btn-sm"
									href={resolve(`/family/${data.familyId}/lists`)}
									>{messages['details.create_a_shopping_list']()}</a
								>
							{/if}
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>
</div>
