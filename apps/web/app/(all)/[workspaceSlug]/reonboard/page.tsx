"use client";

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { Button, Input, Spinner, TOAST_TYPE, setToast } from '@plane/ui';
import { UserService } from '@/services/user.service';
import { ProjectService } from '@/services/project/project.service';
import { useUser } from '@/hooks/store';
import { IUser } from '@plane/types';

const userService = new UserService();
const projectService = new ProjectService();

const USER_ROLE = ["Styret", "Driftsgruppen"];

type TReonboardFormValues = {
  nickname: string;
  role: string;
};

export default function ReonboardPage() {
  const router = useRouter();
  const { workspaceSlug } = useParams() as { workspaceSlug: string };
  const { updateCurrentUser } = useUser();
  const [user, setUser] = useState<IUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const {
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting, isValid },
  } = useForm<TReonboardFormValues>({
    defaultValues: {
      nickname: "",
      role: "",
    },
    mode: "onChange",
  });

  const handleReonboardUser = async (formData: TReonboardFormValues) => {
    if (!user) return false;

    const userDetailsPayload: Partial<IUser> = {
      first_name: formData.nickname,
      last_name: `(${formData.role})`,
      display_name: formData.nickname,
      user_timezone: "Europe/Paris",
    };

    const profileUpdatePayload = {
      use_case: "Other",
      role: "Individual contributor",
      start_of_the_week: 1,
    };

    const emailNotificationsPayload = {
      property_change: true,
      state_change: true,
      comment: true,
      mention: true,
      issue_completed: true,
    };

    try {
      await Promise.all([
        updateCurrentUser(userDetailsPayload),
        userService.updateCurrentUserProfile(profileUpdatePayload),
        userService.updateCurrentUserEmailNotificationSettings(emailNotificationsPayload),
        projectService
          .getProjects(workspaceSlug)
          .then((projects) => projects.map((project) => project.id))
          .then((projectIds) => userService.joinProject(workspaceSlug, projectIds))
          .catch(console.error),
      ]);

      // Refresh user data
      await Promise.all([
        userService.currentUser(),
        userService.getCurrentUserProfile(),
        userService.currentUserSettings(),
      ]).catch(console.error);

      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success",
        message: "Re-onboarding completed successfully!",
      });

      return true;
    } catch (error) {
      console.error('Re-onboarding failed:', error);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: "Re-onboarding failed. Please try again!",
      });
      return false;
    }
  };

  const onSubmit = async (formData: TReonboardFormValues) => {
    const success = await handleReonboardUser(formData);

    if (success) {
      // Redirect to workspace after completion
      router.push(`/${workspaceSlug}`);
    }
  };

  useEffect(() => {
    if (!workspaceSlug) return;

    const fetchUserData = async () => {
      try {
        const userData = await userService.currentUser();
        setUser(userData);

        // Set form defaults based on current user data
        setValue("nickname", userData.display_name || userData.first_name || userData.email.split("@")[0] || "");

        // Try to extract role from last_name if it exists
        const lastNameMatch = userData.last_name?.match(/\((.*)\)/);
        if (lastNameMatch && USER_ROLE.includes(lastNameMatch[1])) {
          setValue("role", lastNameMatch[1]);
        }

        setIsLoading(false);
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error",
          message: "Failed to load user data. Please try again!",
        });
        router.push(`/${workspaceSlug}`);
      }
    };

    fetchUserData();
  }, [workspaceSlug, router, setValue]);

  if (!workspaceSlug || isLoading || !user) {
    return <div className="flex h-screen w-full items-center justify-center">Loading...</div>;
  }

  if (isSubmitting) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <Spinner height="40px" width="40px" />
          <p className="text-lg font-medium">Re-onboarding your account...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="flex flex-col w-full max-w-md items-center justify-center p-8">
        <div className="text-center space-y-1 py-4 mx-auto">
          <h3 className="text-3xl font-bold text-onboarding-text-100">Update Your Profile</h3>
          <p className="font-medium text-onboarding-text-400">Let&apos;s update your information.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="w-full mx-auto mt-2 space-y-4">
          <div className="space-y-1">
            <label
              className="text-sm text-onboarding-text-300 font-medium after:content-['*'] after:ml-0.5 after:text-red-500"
              htmlFor="nickname"
            >
              Nickname
            </label>
            <Controller
              control={control}
              name="nickname"
              rules={{
                required: "Nickname is required",
                maxLength: {
                  value: 24,
                  message: "Nickname must be within 24 characters.",
                },
              }}
              render={({ field: { value, onChange, ref } }) => (
                <Input
                  id="nickname"
                  name="nickname"
                  type="text"
                  value={value}
                  onChange={onChange}
                  ref={ref}
                  hasError={Boolean(errors.nickname)}
                  placeholder="Enter your nickname"
                  className="w-full border-onboarding-border-100"
                  autoComplete="on"
                />
              )}
            />
            {errors.nickname && <span className="text-sm text-red-500">{errors.nickname.message}</span>}
          </div>

          <div className="space-y-1">
            <label
              className="text-sm text-onboarding-text-300 font-medium after:content-['*'] after:ml-0.5 after:text-red-500"
              htmlFor="role"
            >
              Are you a member of the board, or the operations group?
            </label>
            <Controller
              control={control}
              name="role"
              rules={{
                required: "This field is required",
              }}
              render={({ field: { value, onChange } }) => (
                <div className="flex flex-wrap gap-2 py-2 overflow-auto break-all">
                  {USER_ROLE.map((userRole) => (
                    <div
                      key={userRole}
                      className={`flex-shrink-0 border-[0.5px] hover:cursor-pointer hover:bg-onboarding-background-300/30 ${
                        value === userRole ? "border-custom-primary-100" : "border-onboarding-border-100"
                      } rounded px-3 py-1.5 text-sm font-medium`}
                      onClick={() => onChange(userRole)}
                    >
                      {userRole}
                    </div>
                  ))}
                </div>
              )}
            />
            {errors.role && <span className="text-sm text-red-500">{errors.role.message}</span>}
          </div>

          <Button
            variant="primary"
            type="submit"
            size="lg"
            className="w-full"
            disabled={!isValid || isSubmitting}
          >
            {isSubmitting ? <Spinner height="20px" width="20px" /> : "Update Profile"}
          </Button>
        </form>
      </div>
    </div>
  );
}
