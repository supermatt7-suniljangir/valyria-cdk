// import * as cdk from 'aws-cdk-lib';
// import * as s3 from 'aws-cdk-lib/aws-s3';
// import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
// import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
// import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
// import { Stack, StackProps } from 'aws-cdk-lib';
// import { STAGES } from './stages';
// import * as codebuild from 'aws-cdk-lib/aws-codebuild';
// import * as iam from 'aws-cdk-lib/aws-iam';

// interface ReactDeploymentStackProps extends StackProps {
//     stageName?: string;
// }

// export class ReactDeploymentStack extends Stack {
//     constructor(scope: cdk.App, id: string, props: ReactDeploymentStackProps) {
//         super(scope, id, props);

//         const stageName = props.stageName || STAGES.DEV;
//         const githubOwner = 'bharatrajput2409';
//         const githubRepo = 'scalar-pay-frontend';
//         const githubBranch = 'master' + '-' + stageName;

//         // Create an S3 bucket to host the React app
//         const hostingBucket = new s3.Bucket(this, 'ScalarPayBucket', {
//             bucketName: `${stageName}-scalar-pay`,
//             websiteIndexDocument: 'index.html',
//             websiteErrorDocument: 'index.html',
//             publicReadAccess: true,
//             removalPolicy: cdk.RemovalPolicy.RETAIN,
//             autoDeleteObjects: true,
//         });

//         // Create a CloudFront distribution
//         const distribution = new cloudfront.Distribution(this, 'ScalarPayDistribution', {
//             defaultBehavior: {
//                 origin: new origins.S3Origin(hostingBucket),
//                 viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
//             },
//             defaultRootObject: 'index.html',
//             errorResponses: [
//                 {
//                     httpStatus: 404,
//                     responseHttpStatus: 200,
//                     responsePagePath: '/index.html',
//                 },
//             ],
//         });

//         // CodeBuild project to fetch the GitHub repository and build it
//         const project = new codebuild.PipelineProject(this, 'BuildProject', {
//             environment: {
//                 buildImage: codebuild.LinuxBuildImage.STANDARD_5_0, // or the version of your choice
//             },
//             source: codebuild.Source.gitHub({
//                 owner: githubOwner,
//                 repo: githubRepo,
//                 branchOrRef: githubBranch,
//             }),
//             buildSpec: codebuild.BuildSpec.fromObject({
//                 version: '0.2',
//                 phases: {
//                     install: {
//                         commands: [
//                             'npm install', // Install dependencies
//                         ],
//                     },
//                     build: {
//                         commands: [
//                             'npm run build', // Run the React build command
//                         ],
//                     },
//                 },
//                 artifacts: {
//                     'base-directory': 'build', // The directory where your build artifacts are located
//                     files: ['**/*'], // Upload all files from the build directory
//                 },
//             }),
//         });

//         // Add necessary permissions for the CodeBuild project
//         project.addToRolePolicy(new iam.PolicyStatement({
//             actions: ['s3:PutObject', 's3:GetObject', 's3:ListBucket'],
//             resources: [hostingBucket.bucketArn, `${hostingBucket.bucketArn}/*`],
//         }));

//         // Deploy the React app to S3
//         new s3deploy.BucketDeployment(this, 'DeployReactApp', {
//             sources: [s3deploy.Source.codeBuild(project)],
//             destinationBucket: hostingBucket,
//             distribution,
//             distributionPaths: ['/*'],
//         });

//         // Output the CloudFront URL
//         new cdk.CfnOutput(this, 'CloudFrontURL', {
//             value: `https://${distribution.distributionDomainName}`,
//             description: 'URL for the CloudFront distribution',
//         });

//         // Add stage-specific tags
//         cdk.Tags.of(this).add('Stage', stageName);
//     }
// }
